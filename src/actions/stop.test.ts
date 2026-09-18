import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { stopWorkflow } from "./stop.ts";

describe("actions/stop.ts", () => {
	const info: HookInfo = {
		type: "pre",
		payload: { conversationId: "c1" },
	};

	test("stopWorkflow resets active workflow state", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: { name: "Test WF", filePath: "wf.json", steps: [], flatSteps: [] },
		};

		const res = stopWorkflow(info, active);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STOPPED]
			Workflow "Test WF" has been stopped.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "finished",
			    "step": 0,
			  },
			}
		`);
	});

	test("stopWorkflow resets paused workflow state", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 1,
				iterationCount: 1,
			},
			workflow: { name: "Paused WF", filePath: "wf.json", steps: [], flatSteps: [] },
		};

		const res = stopWorkflow(info, active);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STOPPED]
			Workflow "Paused WF" has been stopped.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 1,
			  },
			}
		`);
	});

	test("stopWorkflow handles when no workflow is running", () => {
		const res = stopWorkflow(info, null);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS]
			No workflow is currently running.",
			      },
			    ],
			  },
			  "state": undefined,
			}
		`);
	});
});
