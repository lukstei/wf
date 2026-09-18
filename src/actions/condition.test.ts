import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import { flattenWorkflow, type WorkflowAst } from "../workflow.ts";
import { conditionPre, conditionStop } from "./condition.ts";

const condDef: WorkflowAst = {
	name: "CondFlow",
	steps: [
		{
			type: "condition",
			title: "Check Database",
			condition: "is db healthy?",
			yes: {
				steps: [
					{ type: "step", title: "Run queries", instruction: "Run queries" },
				],
			},
			no: {
				steps: [
					{ type: "step", title: "Restart db", instruction: "Restart db" },
				],
			},
		},
		{ type: "step", title: "Finish", instruction: "Finish" },
	],
};

describe("actions/condition.ts", () => {
	test("conditionPre injects formatted condition prompt", () => {
		const flat = flattenWorkflow(condDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				steps: condDef.steps,
				flatSteps: flat,
			},
		};

		const res = conditionPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			active,
		);
		expect(
			res.response.injectSteps?.[0]?.ephemeralMessage,
		).toMatchInlineSnapshot(`
			"[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: CondFlow]
			Step 1 of 4: Check Database (Condition Evaluation)
			Condition: "is db healthy?"

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is db healthy?".
			If needed, use tools to inspect the environment, files, date/time, or git state.

			Start your response with: "Checking condition: is db healthy?"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner."
		`);
	});

	test("conditionStop parses YES decision and jumps to yes branch", () => {
		const flat = flattenWorkflow(condDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				steps: condDef.steps,
				flatSteps: flat,
			},
		};

		const res = conditionStop(
			{
				type: "stop",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 1,
					type: "PLANNER_RESPONSE",
					content: "DB connection is good. [DECISION: YES]",
				},
			},
			active,
		);

		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Run queries (Level 1)

			INSTRUCTION:
			Run queries

			Start your response with: "Executing Step: Run queries"
			Continue immediately and execute this step.",
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 1,
			  },
			}
		`);
	});

	test("conditionStop parses NO decision and jumps to no branch", () => {
		const flat = flattenWorkflow(condDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				steps: condDef.steps,
				flatSteps: flat,
			},
		};

		const res = conditionStop(
			{
				type: "stop",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 1,
					type: "PLANNER_RESPONSE",
					content: "DB connection timed out. [DECISION: NO]",
				},
			},
			active,
		);

		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Restart db (Level 1)

			INSTRUCTION:
			Restart db

			Start your response with: "Executing Step: Restart db"
			Continue immediately and execute this step.",
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 2,
			  },
			}
		`);
	});

	test("conditionStop completes workflow if branch leads past end of steps", () => {
		const singleCond: WorkflowAst = {
			name: "SkipCondition",
			steps: [
				{
					type: "condition",
					title: "skip everything?",
					condition: "skip everything?",
					yes: { steps: [] },
					no: { steps: [] },
				},
			],
		};
		const flat = flattenWorkflow(singleCond.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Single",
				filePath: "wf.json",
				steps: singleCond.steps,
				flatSteps: flat,
			},
		};

		const res = conditionStop(
			{
				type: "stop",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 1,
					type: "PLANNER_RESPONSE",
					content: "[DECISION: YES]",
				},
			},
			active,
		);

		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "allow",
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 1,
			  },
			}
		`);
	});

	test("conditionStop injects workflow preamble and step instruction into continuation reason", () => {
		const steps: WorkflowAst["steps"] = [
			{
				type: "condition",
				title: "is ready?",
				condition: "is ready?",
				yes: {
					steps: [
						{
							type: "step",
							title: "Deploy",
							instruction: "Deploy step instruction",
						},
					],
				},
			},
		];
		const flat = flattenWorkflow(steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps,
				preamble: "Global preamble",
				flatSteps: flat,
			},
		};

		const res = conditionStop(
			{
				type: "stop",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 1,
					type: "PLANNER_RESPONSE",
					content: "Ready. [DECISION: YES]",
				},
			},
			active,
		);
		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Deploy (Level 1)

			CONTEXT:
			Global preamble

			INSTRUCTION:
			Deploy step instruction

			Start your response with: "Executing Step: Deploy"
			Continue immediately and execute this step.",
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 1,
			  },
			}
		`);
	});

	test("conditionStop asserts precondition when state is not active", () => {
		expect(() =>
			conditionStop({ type: "stop", payload: { conversationId: "c1" } }, null),
		).toThrow("conditionStop requires an active workflow");

		const pausedActive: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Paused",
				filePath: "wf.json",
				steps: [],
				flatSteps: [],
			},
		};
		expect(() =>
			conditionStop(
				{ type: "stop", payload: { conversationId: "c1" } },
				pausedActive,
			),
		).toThrow("conditionStop requires an active workflow");
	});

	test("conditionStop asserts precondition when current step is not a condition", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps: [],
				flatSteps: [
					{
						id: "s1",
						type: "step",
						title: "Step 1",
						instruction: "do work",
						level: 0,
						index: 0,
						nextIndex: 1,
					},
				],
			},
		};

		expect(() =>
			conditionStop(
				{ type: "stop", payload: { conversationId: "c1" } },
				active,
			),
		).toThrow("conditionStop requires current step to be a condition");
	});

	test("conditionStop terminates with error when safety iteration limit is exceeded", () => {
		const flat = flattenWorkflow(condDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: flat.length * 5,
			},
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				steps: condDef.steps,
				flatSteps: flat,
			},
		};

		const res = conditionStop(
			{
				type: "stop",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 1,
					type: "PLANNER_RESPONSE",
					content: "[DECISION: YES]",
				},
			},
			active,
		);
		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "allow",
			  },
			  "state": {
			    "error": "Workflow terminated: Exceeded safety iteration limit (20).",
			    "iterationCount": 21,
			    "status": "error",
			    "step": 0,
			  },
			}
		`);
	});
});
