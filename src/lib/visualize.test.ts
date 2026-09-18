import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledWorkflow, WorkflowAst } from "../workflow.ts";
import {
	visualize,
	visualizePlainText,
	visualizeWorkflowPrompt,
} from "./visualize.ts";

describe("visualize", () => {
	it("handles empty workflow", () => {
		expect(visualize({ name: "Empty", steps: [] })).toMatchInlineSnapshot(`"flowchart TD"`);
	});

	it("converts linear action steps", () => {
		const wf: WorkflowAst = {
			name: "Linear",
			steps: [
				{ type: "step", title: "Step A", instruction: "Do A" },
				{ type: "step", title: "Step B", instruction: "Do B" },
			],
		};

		expect(visualize(wf)).toMatchInlineSnapshot(`
      "flowchart TD
          s0["Step A"]
          s1["Step B"]
          s0 --> s1"
    `);
	});

	it("converts conditional workflow like sample-wf.json", () => {
		const samplePath = path.resolve(
			import.meta.dirname,
			"../../examples/sample-wf.json",
		);
		const sampleDef: WorkflowAst = JSON.parse(
			fs.readFileSync(samplePath, "utf-8"),
		);

		expect(visualize(sampleDef)).toMatchInlineSnapshot(`
      "flowchart TD
          s0["Report Current Status"]
          s1{{"<i>Check Day Condition</i>"}}
          s2["Report Friday Status"]
          s3["Report Non-Friday Status"]
          s4["Verify and Conclude"]
          s0 --> s1
          s1 -->|Yes| s2
          s1 -->|No| s3
          s2 --> s4
          s3 --> s4"
    `);
	});

	it("escapes quotes and newlines in node labels", () => {
		const wf: WorkflowAst = {
			name: "Escape",
			steps: [
				{ type: "step", title: 'Say "Hello"', instruction: "line 1\nline 2" },
				{
					type: "condition",
					title: 'has "key"?',
					condition: 'has "key"?',
					yes: {
						steps: [{ type: "step", title: "result", instruction: "result" }],
					},
				},
			],
		};

		expect(visualize(wf)).toMatchInlineSnapshot(`
      "flowchart TD
          s0["Say #quot;Hello#quot;"]
          s1{{"<i>has #quot;key#quot;?</i>"}}
          s2["result"]
          s0 --> s1
          s1 -->|Yes| s2"
    `);
	});

	it("handles condition without no-branch skipping to subsequent step", () => {
		const wf: WorkflowAst = {
			name: "ConditionSkip",
			steps: [
				{
					type: "condition",
					title: "is ready?",
					condition: "is ready?",
					yes: {
						steps: [
							{ type: "step", title: "Prepare", instruction: "Do prepare" },
						],
					},
				},
				{ type: "step", title: "Finish", instruction: "Complete" },
			],
		};

		expect(visualize(wf)).toMatchInlineSnapshot(`
      "flowchart TD
          s0{{"<i>is ready?</i>"}}
          s1["Prepare"]
          s2["Finish"]
          s0 -->|Yes| s1
          s0 -->|No| s2
          s1 --> s2"
    `);
	});

	it("handles deeply nested conditions with wrapped labels and subgraphs", () => {
		const wf: WorkflowAst = {
			name: "Nested",
			steps: [
				{ type: "step", title: "Step 1: Start", instruction: "start" },
				{
					type: "condition",
					title: "environment is prod?",
					condition: "environment is prod?",
					yes: {
						steps: [
							{
								type: "step",
								title: "Step 2a: Check Credentials",
								instruction: "check",
							},
							{
								type: "condition",
								title: "database migration required?",
								condition: "database migration required?",
								yes: {
									steps: [
										{
											type: "step",
											title: "Step 2b-i: Run Migration",
											instruction: "migrate",
										},
										{
											type: "step",
											title: "Step 2b-ii: Verify Migration",
											instruction: "verify",
										},
									],
								},
								no: {
									steps: [
										{
											type: "step",
											title: "Step 2b-alt: Skip Migration",
											instruction: "skip",
										},
									],
								},
							},
							{
								type: "step",
								title: "Step 2c: Finalize Cloud",
								instruction: "finalize",
							},
						],
					},
					no: {
						steps: [
							{
								type: "step",
								title: "Local Step: Docker Compose",
								instruction: "docker",
							},
						],
					},
				},
				{ type: "step", title: "Step 3: Finish", instruction: "finish" },
			],
		};

		expect(visualize(wf)).toMatchInlineSnapshot(`
      "flowchart TD
          s0["Step 1: Start"]
          s1{{"<i>environment is prod?</i>"}}
          s2["Step 2a: Check Credentials"]
          s3{{"<i>database migration required?</i>"}}
          s4["Step 2b-i: Run Migration"]
          s5["Step 2b-ii: Verify Migration"]
          s6["Step 2b-alt: Skip Migration"]
          s7["Step 2c: Finalize Cloud"]
          s8["Local Step: Docker Compose"]
          s9["Step 3: Finish"]
          s0 --> s1
          s1 -->|Yes| s2
          s1 -->|No| s8
          s2 --> s3
          s3 -->|Yes| s4
          s3 -->|No| s6
          s4 --> s5
          s5 --> s7
          s6 --> s7
          s7 --> s9
          s8 --> s9"
    `);
	});
});

describe("visualizePlainText", () => {
	it("handles empty workflow", () => {
		expect(visualizePlainText({ name: "Empty", steps: [] })).toMatchInlineSnapshot(`""`);
	});

	it("converts linear action steps", () => {
		const wf: WorkflowAst = {
			name: "Linear",
			steps: [
				{ type: "step", title: "echo XX", instruction: "echo XX" },
				{ type: "step", title: "Show current time", instruction: "date" },
			],
		};

		expect(visualizePlainText(wf)).toMatchInlineSnapshot(`
      "- Step: echo XX
      - Step: Show current time"
    `);
	});

	it("converts conditional workflow matching user example format", () => {
		const wf: WorkflowAst = {
			name: "friday-check",
			steps: [
				{ type: "step", title: "echo XX", instruction: "echo XX" },
				{ type: "step", title: "Show current time", instruction: "date" },
				{
					type: "condition",
					title: "if friday",
					condition: "if friday",
					yes: {
						steps: [
							{
								type: "step",
								title: "hello friday",
								instruction: "hello friday",
							},
						],
					},
				},
				{ type: "step", title: "say bye", instruction: "say bye" },
			],
		};

		expect(visualizePlainText(wf)).toMatchInlineSnapshot(`
      "- Step: echo XX
      - Step: Show current time
      - If: if friday
        - Step: hello friday
      - Step: say bye"
    `);
	});

	it("handles else branches and nested conditions", () => {
		const wf: WorkflowAst = {
			name: "WeekendCheck",
			steps: [
				{
					type: "condition",
					title: "is weekend?",
					condition: "is weekend?",
					yes: {
						steps: [{ type: "step", title: "relax", instruction: "relax" }],
					},
					no: {
						steps: [
							{ type: "step", title: "work", instruction: "work" },
							{
								type: "condition",
								title: "is monday?",
								condition: "is monday?",
								yes: {
									steps: [
										{
											type: "step",
											title: "drink coffee",
											instruction: "drink coffee",
										},
									],
								},
								no: {
									steps: [
										{
											type: "step",
											title: "keep going",
											instruction: "keep going",
										},
									],
								},
							},
						],
					},
				},
			],
		};

		expect(visualizePlainText(wf)).toMatchInlineSnapshot(`
      "- If: is weekend?
        - Step: relax
      - Else:
        - Step: work
        - If: is monday?
          - Step: drink coffee
        - Else:
          - Step: keep going"
    `);
	});
});

describe("visualizeWorkflowPrompt", () => {
	it("formats visualization prompt with mermaid and plain text", () => {
		const wf: WorkflowAst = {
			name: "Simple",
			steps: [{ type: "step", title: "Step 1", instruction: "Do 1" }],
		};

		expect(visualizeWorkflowPrompt("Simple", wf)).toMatchInlineSnapshot(`
      "[WORKFLOW VISUALIZATION: Simple]
      Present the structure of workflow "Simple" to the user.

      If your environment supports rendering Mermaid diagrams, visualize it using:
      \`\`\`mermaid
      flowchart TD
          s0["Step 1"]
      \`\`\`

      If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

      - Step: Step 1

      RULES:
      1. Do NOT read or inspect the workflow file or SKILL.md — steps are already loaded by the runner.
      2. Do NOT execute any workflow steps. This is strictly an informational visualization."
    `);
	});

	it("formats visualization prompt with active step highlight and status header", () => {
		const wf: WorkflowAst = {
			name: "Sample",
			steps: [
				{ type: "step", title: "Step 1", instruction: "Do 1" },
				{ type: "step", title: "Step 2", instruction: "Do 2" },
			],
		};

		const statusHeader =
			"[WORKFLOW STATUS: ACTIVE]\nWorkflow: Sample\nStep: 2 of 2 (Nesting Level 0)";
		const res = visualizeWorkflowPrompt(
			"Sample",
			wf,
			"/path/wf.md",
			1,
			statusHeader,
		);

		expect(res).toContain(statusHeader);
		expect(res).toContain('s1["▶ Step 2"]');
		expect(res).toContain("style s1 stroke:#3b82f6,stroke-width:4px");
		expect(res).toContain("▶ [CURRENT] - Step: Step 2");
	});

	it("works with CompiledWorkflow", () => {
		const wfInfo: CompiledWorkflow = {
			name: "TestWf",
			filePath: "test.json",
			steps: [
				{
					type: "step",
					title: "Start",
					instruction: "Start",
				},
				{
					type: "condition",
					title: "Check",
					condition: "Check",
					yes: { steps: [] },
				},
			],
			flatSteps: [
				{
					index: 0,
					level: 0,
					type: "step",
					title: "Start",
					nextIndex: 1,
				},
				{
					index: 1,
					level: 0,
					type: "condition",
					title: "Check",
					nextIndex: 2,
				},
			],
		};

		const mermaid = visualize(wfInfo, 0);
		expect(mermaid).toContain('s0["▶ Start"]');
		expect(mermaid).toContain("style s0 stroke:#3b82f6,stroke-width:4px");

		const plainText = visualizePlainText(wfInfo, 0);
		expect(plainText).toContain("▶ [CURRENT] - Step: Start");
		expect(plainText).toContain("- If: Check");
	});
});
