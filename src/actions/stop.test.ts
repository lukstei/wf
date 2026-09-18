import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { stopWorkflow } from "./stop.ts";

describe("actions/stop.ts", () => {
	const info: HookInfo = {
		type: "pre",
		payload: { conversationId: "c1" },
	};

	test("stopWorkflow resets active workflow state", () => {
		const state: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 0,
			workflow: { name: "Test WF", filePath: "wf.json", flatSteps: [] },
		};

		const res = stopWorkflow(info, state);
		expect(res.state?.status).toBe("finished");
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow "Test WF" has been stopped\./,
		);
	});

	test("stopWorkflow resets paused workflow state", () => {
		const state: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
			workflow: { name: "Paused WF", filePath: "wf.json", flatSteps: [] },
		};

		const res = stopWorkflow(info, state);
		expect(res.state?.status).toBe("finished");
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow "Paused WF" has been stopped\./,
		);
	});

	test("stopWorkflow handles when no workflow is running", () => {
		const res = stopWorkflow(info, null);
		expect(res.state).toBeNull();
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/No workflow is currently running\./,
		);
	});
});
