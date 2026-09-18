import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import { flattenWorkflow, type WorkflowAst } from "../workflow.ts";
import { handleStop } from "./stop.ts";

const sampleDef: WorkflowAst = {
	name: "Sample",
	steps: [
		{ type: "step", title: "Task 1", instruction: "Do task" },
		{
			type: "condition",
			title: "is ready?",
			condition: "is ready?",
			yes: {
				steps: [{ type: "step", title: "Deploy", instruction: "Deploy" }],
			},
			no: { steps: [{ type: "step", title: "Fix", instruction: "Fix" }] },
		},
	],
};

describe("handlers/stop.ts", () => {
	test("handleStop allows stop when no workflow is loaded", () => {
		const res = handleStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			null,
		);
		expect({
			state: res.active?.state,
			response: res.response,
		}).toMatchInlineSnapshot(`
			{
			  "response": {
			    "decision": "allow",
			  },
			  "state": undefined,
			}
		`);
	});

	test("handleStop allows stop on error or cancellation termination reasons", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const errRes = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", error: "Fatal error" },
			},
			active,
		);

		const abortRes = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "user_interrupt" },
			},
			active,
		);

		expect({
			errRes: { state: errRes.active?.state, response: errRes.response },
			abortRes: { state: abortRes.active?.state, response: abortRes.response },
		}).toMatchInlineSnapshot(`
			{
			  "abortRes": {
			    "response": {
			      "decision": "allow",
			    },
			    "state": {
			      "iterationCount": 0,
			      "status": "paused",
			      "step": 0,
			    },
			  },
			  "errRes": {
			    "response": {
			      "decision": "allow",
			    },
			    "state": {
			      "error": "Fatal error",
			      "iterationCount": 0,
			      "status": "error",
			      "step": 0,
			    },
			  },
			}
		`);
	});

	test("handleStop does not advance step if status is paused", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 1,
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const res = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "model_stop" },
				latestMessage: {
					stepIndex: 2,
					type: "PLANNER_RESPONSE",
					content: "Just chatting with user",
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
			    "iterationCount": 0,
			    "status": "paused",
			    "step": 1,
			  },
			}
		`);
	});

	test("handleStop dispatches action steps to nextStop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0, // s1 action
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const res = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "model_stop" },
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
			    "reason": "[wf] Executing next step: is ready?

			Evaluate condition: "is ready?"

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

	test("handleStop dispatches condition steps to conditionStop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1, // c1 condition
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const resYes = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "model_stop" },
				latestMessage: {
					stepIndex: 2,
					type: "PLANNER_RESPONSE",
					content: "Ready! [DECISION: YES]",
				},
			},
			active,
		);

		const resNo = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "model_stop" },
				latestMessage: {
					stepIndex: 2,
					type: "PLANNER_RESPONSE",
					content: "Not ready yet. [DECISION: NO]",
				},
			},
			active,
		);
		expect({
			resYes: { state: resYes.active?.state, response: resYes.response },
			resNo: { state: resNo.active?.state, response: resNo.response },
		}).toMatchInlineSnapshot(`
			{
			  "resNo": {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: Fix (Level 1)

			INSTRUCTION:
			Fix

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "active",
			      "step": 3,
			    },
			  },
			  "resYes": {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: Deploy (Level 1)

			INSTRUCTION:
			Deploy

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "active",
			      "step": 2,
			    },
			  },
			}
		`);
	});
});
