import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import { flattenWorkflow, type WorkflowDef } from "../workflow.ts";
import { handleStop } from "./stop.ts";

const sampleDef: WorkflowDef = {
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
		expect(res.response.decision).toBe("allow");
	});

	test("handleStop allows stop on error or cancellation termination reasons", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 0,
		};
		const errRes = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", error: "Fatal error" },
			},
			state,
		);
		expect(errRes.response.decision).toBe("allow");
		expect(errRes.state?.status).toBe("error");

		const abortRes = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "user_interrupt" },
			},
			state,
		);
		expect(abortRes.response.decision).toBe("allow");
		expect(abortRes.state?.status).toBe("paused");
	});

	test("handleStop does not advance step if status is paused", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "paused",
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 1,
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
			state,
		);
		expect(res.response.decision).toBe("allow");
		expect(res.state?.currentStepIndex).toBe(1);
		expect(res.state?.status).toBe("paused");
	});

	test("handleStop dispatches action steps to nextStop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 0, // s1 action
		};
		const res = handleStop(
			{
				type: "stop",
				payload: { conversationId: "c1", terminationReason: "model_stop" },
			},
			state,
		);
		expect(res.state?.currentStepIndex).toBe(1);
		expect(res.response.decision).toBe("continue");
		expect(res.response.reason).toMatch(
			/^\[wf\] Executing next step: is ready\?/,
		);
	});

	test("handleStop dispatches condition steps to conditionStop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 1, // c1 condition
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
			state,
		);
		// YES branch should jump to y1 (index 2)
		expect(resYes.state?.currentStepIndex).toBe(2);
		expect(resYes.response.decision).toBe("continue");
		expect(resYes.response.reason).toContain("Deploy");

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
			state,
		);
		// NO branch should jump to n1 (index 3)
		expect(resNo.state?.currentStepIndex).toBe(3);
		expect(resNo.response.decision).toBe("continue");
		expect(resNo.response.reason).toContain("Fix");
	});
});
