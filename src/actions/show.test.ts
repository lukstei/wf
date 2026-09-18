import * as path from "node:path";
import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import { stripAbsolutePath } from "../test-utils.ts";
import type { WorkflowDef } from "../workflow.ts";
import { show } from "./show.ts";

const sampleDef: WorkflowDef = {
	name: "SampleShow",
	steps: [
		{ type: "step", title: "Step 1", instruction: "Do something" },
		{
			type: "condition",
			title: "is friday",
			condition: "is friday",
			yes: {
				steps: [
					{ type: "step", title: "hello friday", instruction: "hello friday" },
				],
			},
		},
	],
};

describe("actions/show.ts", () => {
	test("show reports when no workflow is loaded and no path argument is provided", () => {
		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
			},
			null,
			{ name: "show", args: {} },
		);
		expect(
			res.response.injectSteps?.[0]?.ephemeralMessage,
		).toMatchInlineSnapshot(`
			"[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS]
			No workflow is currently loaded. Run /wf <workflow-file> to start a workflow, or /wf-show <workflow-file> to inspect one."
		`);
	});

	test("show visualizes active workflow with current step highlighted when invoked without argument", () => {
		const activeState: WorkflowState = {
			status: "active",
			currentStepIndex: 1,
			iterationCount: 2,
			workflow: {
				name: "ActiveFlow",
				filePath: "/active.json",
				flatSteps: [
					{ index: 0, level: 0, type: "step", title: "Step 0", nextIndex: 1 },
					{
						index: 1,
						level: 1,
						type: "condition",
						title: "Check Day",
						condition: "day is fri",
						nextIndex: 2,
					},
					{ index: 2, level: 1, type: "step", title: "Step 2", nextIndex: 3 },
				],
			},
		};

		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
			},
			activeState,
			{ name: "show", args: {} },
		);

		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toContain("[WORKFLOW STATUS: ACTIVE]");
		expect(msg).toContain("Workflow: ActiveFlow");
		expect(msg).toContain("Step: 2 of 3 (Nesting Level 1)");
		expect(msg).toContain('s1{{"<i>▶ Check Day</i>"}}');
		expect(msg).toContain("style s1 stroke:#3b82f6,stroke-width:4px");
		expect(msg).toContain("  ▶ [CURRENT] - If: Check Day");
	});

	test("show reports finished and error states when invoked without argument", () => {
		const finishedState: WorkflowState = {
			status: "finished",
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				flatSteps: [
					{
						id: "s1",
						type: "step",
						instruction: "1",
						level: 0,
						index: 0,
						nextIndex: 1,
					},
				],
			},
		};
		const finishedRes = show(
			{ type: "pre", payload: { conversationId: "c1" } },
			finishedState,
		);
		expect(finishedRes.response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"[WORKFLOW STATUS: FINISHED]",
		);

		const errorState: WorkflowState = {
			status: "error",
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				flatSteps: [
					{
						id: "s1",
						type: "step",
						instruction: "1",
						level: 0,
						index: 0,
						nextIndex: 1,
					},
				],
			},
			currentStepIndex: 0,
			error: "Boom!",
		};
		const errorRes = show(
			{ type: "pre", payload: { conversationId: "c1" } },
			errorState,
		);
		expect(errorRes.response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"[WORKFLOW STATUS: ERROR]",
		);
		expect(errorRes.response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"Boom!",
		);
	});

	test("show highlights active step when specified workflow matches active workflow", () => {
		const activeState: WorkflowState = {
			status: "active",
			currentStepIndex: 1,
			iterationCount: 2,
			workflow: {
				name: "SampleShow",
				filePath: "/sample.json",
				flatSteps: [
					{ index: 0, level: 0, type: "step", title: "Step 1", nextIndex: 1 },
					{
						index: 1,
						level: 0,
						type: "condition",
						title: "is friday",
						nextIndex: 2,
					},
				],
			},
		};

		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({
					filePath: "/sample.json",
					workflow: sampleDef,
				}),
			},
			activeState,
			{ name: "show", args: { path: "/sample.json" } },
		);

		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toContain("[WORKFLOW STATUS: ACTIVE]");
		expect(msg).toContain("style s1 stroke:#3b82f6,stroke-width:4px");
	});

	test("show returns error message when file is not found", () => {
		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => null,
			},
			null,
			{ name: "show", args: { path: "missing.json" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow file not found/,
		);
	});

	test("show returns error message when file has syntax error", () => {
		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({ error: "Failed to parse JSON" }),
			},
			null,
			{ name: "show", args: { path: "bad.json" } },
		);
		expect(res.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Failed to parse JSON/,
		);
	});

	test("show injects visualization prompt without modifying state", () => {
		const activeState: WorkflowState = {
			status: "active",
			currentStepIndex: 1,
			iterationCount: 2,
			workflow: {
				name: "ExistingFlow",
				filePath: "/existing.json",
				flatSteps: [],
			},
		};

		const res = show(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({
					filePath: "/sample.json",
					workflow: sampleDef,
				}),
			},
			activeState,
			{ name: "show", args: { path: "sample.json" } },
		);

		// State is preserved
		expect(res.state).toBe(activeState);

		// Injected message contains prompt, mermaid, and plain text
		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toMatchInlineSnapshot(`
			"[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW VISUALIZATION: SampleShow]
			Present the structure of workflow "SampleShow" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["Step 1"]
			    s1{{"<i>is friday</i>"}}
			    s2["hello friday"]
			    s0 --> s1
			    s1 -->|Yes| s2
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			- Step: Step 1
			- If: is friday
			  - Step: hello friday

			RULES:
			1. Do NOT read or inspect the workflow file ("/sample.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization."
		`);
	});

	test("show works on real sample-wf.md", () => {
		const workspaceRoot = path.resolve(import.meta.dirname, "../..");
		const res = show(
			{
				type: "pre",
				payload: {
					conversationId: "c1",
					workspacePaths: [workspaceRoot],
				},
			},
			null,
			{ name: "show", args: { path: "examples/sample-wf.md" } },
		);

		expect(res.state).toBeNull();
		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(stripAbsolutePath(msg!)).toMatchInlineSnapshot(`
			"[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW VISUALIZATION: Derive an API client from a recorded session]
			Present the structure of workflow "Derive an API client from a recorded session" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["record"]
			    s1{{"<i>it is friday?</i>"}}
			    s2["it is friday? yes"]
			    s3["it is friday? no"]
			    s4["report"]
			    s5["gg"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    s1 -->|No| s3
			    s2 --> s5
			    s3 --> s4
			    s4 --> s5
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			- Step: record
			- If: it is friday?
			  - Step: it is friday? yes
			- Else:
			  - Step: it is friday? no
			  - Step: report
			- Step: gg

			RULES:
			1. Do NOT read or inspect the workflow file ("examples/sample-wf.md") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization."
		`);
	});
});
