import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import { flattenWorkflow, type WorkflowDef } from "../workflow.ts";
import { conditionPre, conditionStop } from "./condition.ts";

const condDef: WorkflowDef = {
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
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				flatSteps: flat,
			},
			currentStepIndex: 0,
		};

		const res = conditionPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			state,
		);
		expect(res).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: CondFlow]
			Step 1 of 4: Check Database (Condition Evaluation)
			Condition: "is db healthy?"

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is db healthy?".
			If needed, use tools to inspect the environment, files, date/time, or git state.
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "currentStepIndex": 0,
			    "status": "active",
			    "workflow": {
			      "filePath": "wf.json",
			      "flatSteps": [
			        {
			          "condition": "is db healthy?",
			          "index": 0,
			          "level": 0,
			          "nextIndex": 1,
			          "skipIndex": 2,
			          "title": "Check Database",
			          "type": "condition",
			        },
			        {
			          "index": 1,
			          "instruction": "Run queries",
			          "level": 1,
			          "nextIndex": 3,
			          "title": "Run queries",
			          "type": "step",
			        },
			        {
			          "index": 2,
			          "instruction": "Restart db",
			          "level": 1,
			          "nextIndex": 3,
			          "title": "Restart db",
			          "type": "step",
			        },
			        {
			          "index": 3,
			          "instruction": "Finish",
			          "level": 0,
			          "nextIndex": 4,
			          "title": "Finish",
			          "type": "step",
			        },
			      ],
			      "name": "CondFlow",
			    },
			  },
			}
		`);
	});

	test("conditionStop parses YES decision and jumps to yes branch", () => {
		const flat = flattenWorkflow(condDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				flatSteps: flat,
			},
			currentStepIndex: 0,
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
			state,
		);

		expect({
			nextStepIndex: res.state?.currentStepIndex,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "nextStepIndex": 1,
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Run queries (Level 1)

			INSTRUCTION:
			Run queries

			Continue immediately and execute this step.",
			  },
			}
		`);
	});

	test("conditionStop parses NO decision and jumps to no branch", () => {
		const flat = flattenWorkflow(condDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				flatSteps: flat,
			},
			currentStepIndex: 0,
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
			state,
		);

		expect({
			nextStepIndex: res.state?.currentStepIndex,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "nextStepIndex": 2,
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Restart db (Level 1)

			INSTRUCTION:
			Restart db

			Continue immediately and execute this step.",
			  },
			}
		`);
	});

	test("conditionStop completes workflow if branch leads past end of steps", () => {
		const singleCond: WorkflowDef = {
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
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "Single",
				filePath: "wf.json",
				flatSteps: flat,
			},
			currentStepIndex: 0,
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
			state,
		);

		expect(res.state?.status).toBe("finished");
		expect(res.response).toEqual({ decision: "allow" });
	});

	test("conditionStop injects workflow preamble and step instruction into continuation reason", () => {
		const flat = flattenWorkflow([
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
		]);
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				preamble: "Global preamble",
				flatSteps: flat,
			},
			currentStepIndex: 0,
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
			state,
		);
		expect(res.state?.currentStepIndex).toBe(1);
		const reason = res.response.reason;
		expect(reason).toContain("CONTEXT:");
		expect(reason).toContain("Global preamble");
		expect(reason).toContain("Deploy step instruction");
	});
});
