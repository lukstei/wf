import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { parseHeading, parseWorkflowMarkdown } from "./md-parser.ts";
import type { WorkflowState } from "./state.ts";
import { handle } from "./wf.ts";
import { flattenWorkflow } from "./workflow.ts";

const fixturesDir = path.resolve(import.meta.dirname, "../fixtures/md-parser");

describe("Markdown Workflow Parser (Fixtures)", () => {
	const files = fs
		.readdirSync(fixturesDir)
		.filter((f) => f.endsWith(".md"))
		.sort();

	for (const file of files) {
		const baseName = path.basename(file, ".md");
		const mdPath = path.join(fixturesDir, file);
		const jsonPath = path.join(fixturesDir, `${baseName}.json`);

		test(`fixture: ${baseName}`, () => {
			const content = fs.readFileSync(mdPath, "utf-8");
			const parsed = parseWorkflowMarkdown(content, mdPath);
			const expected = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
			expect(parsed).toEqual(expected);

			// Verify flattening produces valid sequential steps
			const flat = flattenWorkflow(parsed.steps);
			expect(Array.isArray(flat)).toBe(true);
		});
	}
});

describe("Markdown Workflow Edge Cases & Lifecycle", () => {
	test("handles empty and edge case files gracefully", () => {
		const emptyWf = parseWorkflowMarkdown("");
		expect(emptyWf.steps).toEqual([]);

		const onlyH1 = parseWorkflowMarkdown(
			"# Only Title\n\nSome description without steps",
		);
		expect(onlyH1.name).toBe("Only Title");
		expect(onlyH1.preamble).toBe("Some description without steps");
		expect(onlyH1.steps).toEqual([]);
	});

	test("parses numbered condition headings correctly", () => {
		const wf = parseWorkflowMarkdown(
			"# Numbered Workflow\n\n## 1. Prepare\nRun setup\n\n## 2. If tests pass?\nDeploy\n\n## 3. Else:\nFix tests",
		);
		expect(wf.steps).toHaveLength(2);
		expect(wf.steps[0]).toEqual({
			type: "step",
			title: "1. Prepare",
			instruction: "Run setup",
		});
		expect(wf.steps[1]).toMatchObject({
			type: "condition",
			title: "tests pass?",
			condition: "tests pass?",
			yes: {
				steps: [
					{ type: "step", title: "tests pass? yes", instruction: "Deploy" },
				],
			},
			no: {
				steps: [
					{ type: "step", title: "tests pass? no", instruction: "Fix tests" },
				],
			},
		});
	});

	test("parses heading variations with prefix stripping and first-word fallback", () => {
		expect(parseHeading({ depth: 2, value: "If: Green" })).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading({ depth: 2, value: "If Green" })).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading({ depth: 2, value: "Step 1: If" })).toEqual({
			type: "if",
			condition: "",
			title: "if",
			depth: 2,
		});
		expect(parseHeading({ depth: 2, value: "Schritt 2 If: Green" })).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading({ depth: 2, value: "Schritt 3: Else" })).toEqual({
			type: "else",
			title: "else",
			depth: 2,
		});
		expect(parseHeading({ depth: 2, value: "Step 1: Start" })).toEqual({
			type: "step",
			title: "Step 1: Start",
			depth: 2,
		});
	});

	test("full lifecycle execution of sample-wf.md through handle()", () => {
		const workspaceRoot = path.resolve(import.meta.dirname, "../../../..");
		let state: WorkflowState | null = null;

		// Turn 1: User runs /wf examples/sample-wf.md
		const t1Pre = handle(
			{
				type: "pre",
				payload: {
					conversationId: "test-conv-sample-wf",
					workspacePaths: [workspaceRoot],
				},
				latestMessage: {
					stepIndex: 1,
					type: "USER_INPUT",
					content: "/wf examples/sample-wf.md",
				},
			},
			state,
		);
		expect(t1Pre.state?.status).toBe("active");
		expect(t1Pre.state?.currentStepIndex).toBe(0);
		state = t1Pre.state;

		// Turn 1 Stop: Model completes step 0 ("record")
		const t1Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 2,
					type: "PLANNER_RESPONSE",
					content: "Hello to workflow test!",
				},
			},
			state,
		);
		expect(t1Stop.response.decision).toBe("continue");
		expect(t1Stop.state?.currentStepIndex).toBe(1);
		state = t1Stop.state;

		// Turn 2 Stop: Model evaluates condition as NO
		const t2Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 3,
					type: "PLANNER_RESPONSE",
					content: "Today is Wednesday. [DECISION: NO]",
				},
			},
			state,
		);
		expect(t2Stop.response.decision).toBe("continue");
		expect(t2Stop.state?.currentStepIndex).toBe(3);
		const t2Reason = t2Stop.response.reason;
		expect(t2Reason).toContain("CONTEXT:");
		expect(t2Reason).toContain(
			"This is a workflow to test the worfklow funcitions.",
		);
		expect(t2Reason).toContain("BRANCH CONTEXT:");
		expect(t2Reason).toContain("echo hello monday");
		expect(t2Reason).toContain("report how many days until friday");
		state = t2Stop.state;

		// Turn 3 Stop: Model executes step 3 ("report")
		const t3Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 4,
					type: "PLANNER_RESPONSE",
					content: "There are 2 days until Friday.",
				},
			},
			state,
		);
		expect(t3Stop.response.decision).toBe("continue");
		expect(t3Stop.state?.currentStepIndex).toBe(4);
		const t3Reason = t3Stop.response.reason;
		expect(t3Reason).toContain("CONTEXT:");
		expect(t3Reason).toContain(
			"This is a workflow to test the worfklow funcitions.",
		);
		expect(t3Reason).toContain("report end of workflow - have a nice day");
		state = t3Stop.state;

		// Turn 4 Stop: Model completes step 4 ("gg")
		const t4Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 5,
					type: "PLANNER_RESPONSE",
					content: "Workflow finished - have a nice day!",
				},
			},
			state,
		);
		expect(t4Stop.state?.status).toBe("finished");
		expect(t4Stop.response.decision).toBe("allow");
	});
});
