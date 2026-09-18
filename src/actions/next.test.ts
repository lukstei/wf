import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import {
	type FlatStep,
	flattenWorkflow,
	type WorkflowAst,
} from "../workflow.ts";
import { nextPre, nextStop } from "./next.ts";

const sampleDef: WorkflowAst = {
	name: "Flow",
	steps: [
		{ type: "step", title: "Step 1", instruction: "Do 1" },
		{ type: "step", title: "Step 2", instruction: "Do 2" },
	],
};

describe("actions/next.ts", () => {
	test("nextPre resumes active mode and injects current step", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};

		const res = nextPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			active,
		);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: Flow]
			Step 1 of 2: Step 1

			INSTRUCTION:
			Do 1

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			}
		`);
	});

	test("nextPre throws when workflow is uninitialized or completed", () => {
		expect(() =>
			nextPre({ type: "pre", payload: { conversationId: "c1" } }, null),
		).toThrow("No workflow is running");

		const flat = flattenWorkflow(sampleDef.steps);
		expect(() =>
			nextPre(
				{ type: "pre", payload: { conversationId: "c1" } },
				{
					state: {
						status: "finished",
						step: 2,
						iterationCount: 2,
					},
					workflow: {
						name: "Flow",
						filePath: "wf.json",
						steps: sampleDef.steps,
						flatSteps: flat,
					},
				},
			),
		).toThrow("No workflow is running");
	});

	test("nextStop advances to next step and signals continue in active mode", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			active,
		);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Step 2

			INSTRUCTION:
			Do 2

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

	test("nextStop asserts precondition when workflow is not active", () => {
		expect(() =>
			nextStop({ type: "stop", payload: { conversationId: "c1" } }, null),
		).toThrow("nextStop requires an active workflow");

		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};

		expect(() =>
			nextStop({ type: "stop", payload: { conversationId: "c1" } }, active),
		).toThrow("nextStop requires an active workflow");
	});

	test("nextStop completes workflow when reaching the end", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1, // last step
				iterationCount: 0,
			},
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			active,
		);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "allow",
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			  },
			}
		`);
	});

	test("nextStop injects workflow preamble and step instruction into reason", () => {
		const flat: FlatStep[] = [
			{
				index: 0,
				level: 0,
				title: "Step 1",
				type: "step",
				instruction: "Step 1",
				nextIndex: 1,
			},
			{
				index: 1,
				level: 1,
				title: "Step 2",
				type: "step",
				instruction: "Step 2 instruction",
				nextIndex: 2,
			},
		];
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
				preamble: "Global flow context",
				flatSteps: flat,
			},
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			active,
		);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "continue",
			    "reason": "[wf] Executing next step: Step 2 (Level 1)

			CONTEXT:
			Global flow context

			INSTRUCTION:
			Step 2 instruction

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
});
