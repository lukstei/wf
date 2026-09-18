import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import {
	type FlatStep,
	flattenWorkflow,
	type WorkflowDef,
} from "../workflow.ts";
import { nextPre, nextStop } from "./next.ts";

const sampleDef: WorkflowDef = {
	name: "Flow",
	steps: [
		{ type: "step", title: "Step 1", instruction: "Do 1" },
		{ type: "step", title: "Step 2", instruction: "Do 2" },
	],
};

describe("actions/next.ts", () => {
	test("nextPre resumes active mode and injects current step", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "paused",
			workflow: { name: "Flow", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 0,
		};

		const res = nextPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			state,
		);
		expect(res.state?.status).toBe("active");
		expect(res.response.injectSteps).toBeDefined();
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/\[WORKFLOW ACTIVE: Flow\]/,
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(/Do 1/);
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
					status: "finished",
					workflow: { name: "Flow", filePath: "wf.json", flatSteps: flat },
				},
			),
		).toThrow("No workflow is running");
	});

	test("nextStop advances to next step and signals continue in active mode", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: { name: "Flow", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 0,
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			state,
		);
		expect(res.state?.currentStepIndex).toBe(1);
		expect(res.state?.status).toBe("active");
		expect(res.response.decision).toBe("continue");
		expect(res.response.reason).toMatch(/Do 2/);
	});

	test("nextStop does not advance when workflow is paused", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "paused",
			workflow: { name: "Flow", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 0,
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			state,
		);
		expect(res.state?.currentStepIndex).toBe(0);
		expect(res.state?.status).toBe("paused");
		expect(res.response.decision).toBe("allow");
	});

	test("nextStop completes workflow when reaching the end", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const state: WorkflowState = {
			status: "active",
			workflow: { name: "Flow", filePath: "wf.json", flatSteps: flat },
			currentStepIndex: 1, // last step
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			state,
		);
		expect(res.state?.status).toBe("finished");
		expect(res.response.decision).toBe("allow");
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
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "Flow",
				filePath: "wf.json",
				preamble: "Global flow context",
				flatSteps: flat,
			},
			currentStepIndex: 0,
		};

		const res = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			state,
		);
		expect(res.state?.currentStepIndex).toBe(1);
		const reason = res.response.reason;
		expect(reason).toContain("CONTEXT:");
		expect(reason).toContain("Global flow context");
		expect(reason).toContain("Step 2 instruction");
	});
});
