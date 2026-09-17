import * as path from "node:path";
import { describe, expect, test } from "vitest";
import type { WorkflowDef } from "../workflow.ts";
import { run } from "./run.ts";

const sampleDef: WorkflowDef = {
	name: "SampleRun",
	steps: [
		{ type: "step", title: "Step 1", instruction: "Initial step instruction" },
	],
};

const condDef: WorkflowDef = {
	name: "CondRun",
	steps: [
		{
			type: "condition",
			title: "is ready?",
			condition: "is ready?",
			yes: {
				steps: [{ type: "step", title: "Deploy", instruction: "Deploy" }],
			},
			no: { steps: [{ type: "step", title: "Wait", instruction: "Wait" }] },
		},
	],
};

describe("actions/run.ts", () => {
	test("run returns error message when path argument is missing", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
			},
			null,
			{ name: "run", args: { path: "" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Missing workflow file path for \/wf\./,
		);
	});

	test("run returns error message when file is not found", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => null,
			},
			null,
			{ name: "run", args: { path: "missing.json" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow file not found/,
		);
	});

	test("run returns error message when file has syntax error", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({ error: "Failed to parse JSON" }),
			},
			null,
			{ name: "run", args: { path: "bad.json" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Failed to parse JSON/,
		);
	});

	test("run returns error when workflow has no steps", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({
					filePath: "/empty.json",
					workflow: { steps: [] },
				}),
			},
			null,
			{ name: "run", args: { path: "empty.json" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/contains no executable steps/,
		);
	});

	test("run initializes state and injects step 0 for action step", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({
					filePath: "/sample.json",
					workflow: sampleDef,
				}),
			},
			null,
			{ name: "run", args: { path: "sample.json" } },
		);
		expect(res.state?.status).toBe("active");
		expect(res.state?.currentStepIndex).toBe(0);
		expect(res.state?.iterationCount).toBe(1);
		expect(res.state?.stepPending).toBe(true);
		expect(res.state?.workflow.name).toBe("SampleRun");
		expect(res.response.injectSteps).toBeDefined();
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Initial step instruction/,
		);
	});

	test("run initializes state and injects step 0 for condition step", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({ filePath: "/cond.json", workflow: condDef }),
			},
			null,
			{ name: "run", args: { path: "cond.json" } },
		);
		expect(res.state?.status).toBe("active");
		expect(res.state?.currentStepIndex).toBe(0);
		expect(res.state?.iterationCount).toBe(1);
		expect(res.state?.stepPending).toBe(true);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Condition Evaluation/,
		);
	});

	test("run executes real sample-wf.md workflow with preamble injection", () => {
		const workspaceRoot = path.resolve(import.meta.dirname, "../../../../..");
		const res = run(
			{
				type: "pre",
				payload: {
					conversationId: "c1",
					workspacePaths: [workspaceRoot],
				},
			},
			null,
			{ name: "run", args: { path: "examples/sample-wf.md" } },
		);
		expect(res.state?.status).toBe("active");
		expect(res.state?.currentStepIndex).toBe(0);
		expect(res.state?.workflow.name).toBe(
			"Derive an API client from a recorded session",
		);
		expect(res.state?.workflow.preamble).toBe(
			"This is a workflow to test the worfklow funcitions.",
		);
		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toContain("CONTEXT:");
		expect(msg).toContain(
			"This is a workflow to test the worfklow funcitions.",
		);
		expect(msg).toContain('say "Hello to workflow test"');
	});
});
