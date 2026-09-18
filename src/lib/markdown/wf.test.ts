import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../../state.ts";
import { stripAbsolutePath } from "../../test-utils.ts";
import { handle } from "../../wf.ts";
import { flattenWorkflow } from "../../workflow.ts";
import { parseHeading, parseWorkflowMarkdown } from "./wf.ts";

const fixturesDir = path.resolve(
	import.meta.dirname,
	"../../../fixtures/md-parser",
);

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
		expect(parseHeading("If: Green")).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading("If Green")).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading("Step 1: If")).toEqual({
			type: "if",
			condition: "",
			title: "if",
			depth: 2,
		});
		expect(parseHeading("Schritt 2 If: Green")).toEqual({
			type: "if",
			condition: "Green",
			title: "Green",
			depth: 2,
		});
		expect(parseHeading("Schritt 3: Else")).toEqual({
			type: "else",
			title: "else",
			depth: 2,
		});
		expect(parseHeading("Step 1: Start")).toEqual({
			type: "step",
			title: "Step 1: Start",
			depth: 2,
		});
		expect(parseHeading("No: Skip", 3)).toEqual({
			type: "else",
			title: "Skip",
			depth: 3,
		});
		expect(parseHeading("No", 3)).toEqual({
			type: "else",
			title: "no",
			depth: 3,
		});
	});

	test("parses condition evaluation instructions and nested ### No branch", () => {
		const md = `# Test Flow

## 2. If: Any migrations pending?
Run \`npx prisma migrate status\` to check database state.

### Run dry-run
Run migration dry-run and save output.

### No: Skip verification
Skip to schema verification.
`;
		const wf = parseWorkflowMarkdown(md);
		expect(wf.steps).toHaveLength(1);
		const cond = wf.steps[0];
		expect(cond).toMatchObject({
			type: "condition",
			title: "Any migrations pending?",
			condition: "Any migrations pending?",
			instruction: "Run `npx prisma migrate status` to check database state.",
			yes: {
				steps: [
					{
						type: "step",
						title: "Run dry-run",
						instruction: "Run migration dry-run and save output.",
					},
				],
			},
			no: {
				steps: [
					{
						type: "step",
						title: "Skip verification",
						instruction: "Skip to schema verification.",
					},
				],
			},
		});

		const flat = flattenWorkflow(wf.steps);
		expect(flat).toHaveLength(3);
		expect(flat[0]).toMatchObject({
			type: "condition",
			instruction: "Run `npx prisma migrate status` to check database state.",
			nextIndex: 1,
			skipIndex: 2,
		});
		expect(flat[1]).toMatchObject({
			type: "step",
			title: "Run dry-run",
			instruction: "Run migration dry-run and save output.",
		});
		expect(flat[2]).toMatchObject({
			type: "step",
			title: "Skip verification",
			instruction: "Skip to schema verification.",
		});
	});

	test("parses multi-step YES branch with ### No", () => {
		const md = `# Multi-step

## If: Ready?
Check readiness.

### 1. Dry run
Run dry run.

### 2. Deploy
Run deploy.

### No
Skip deployment.
`;
		const wf = parseWorkflowMarkdown(md);
		expect(wf.steps[0]).toMatchObject({
			type: "condition",
			condition: "Ready?",
			instruction: "Check readiness.",
			yes: {
				steps: [
					{ type: "step", title: "1. Dry run", instruction: "Run dry run." },
					{ type: "step", title: "2. Deploy", instruction: "Run deploy." },
				],
			},
			no: {
				steps: [{ type: "step", title: "No", instruction: "Skip deployment." }],
			},
		});
	});

	test("parses condition without NO branch (if-only skip)", () => {
		const md = `# If-Only

## If: Cache enabled?
Check if cache is enabled.

### Warm cache
Warm Redis cache.

## Next Step
Start server.
`;
		const wf = parseWorkflowMarkdown(md);
		expect(wf.steps).toHaveLength(2);
		expect(wf.steps[0]).toMatchObject({
			type: "condition",
			condition: "Cache enabled?",
			instruction: "Check if cache is enabled.",
			yes: {
				steps: [
					{
						type: "step",
						title: "Warm cache",
						instruction: "Warm Redis cache.",
					},
				],
			},
		});
		expect((wf.steps[0] as any).no).toBeUndefined();
		expect(wf.steps[1]).toMatchObject({
			type: "step",
			title: "Next Step",
			instruction: "Start server.",
		});

		const flat = flattenWorkflow(wf.steps);
		expect(flat[0].nextIndex).toBe(1);
		expect(flat[0].skipIndex).toBe(2);
	});

	test("full lifecycle execution of sample-wf.md through handle()", () => {
		const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
		let active: ActiveWorkflow | null = null;

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
			active,
		);
		active = t1Pre.active;

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
			active,
		);
		active = t1Stop.active;

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
			active,
		);
		active = t2Stop.active;

		// Turn 3 Stop: Model executes step 3 ("it is friday? no" / "echo hello monday")
		const t3Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 4,
					type: "PLANNER_RESPONSE",
					content: "Hello Monday!",
				},
			},
			active,
		);
		active = t3Stop.active;

		// Turn 4 Stop: Model executes step 4 ("report")
		const t4Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 5,
					type: "PLANNER_RESPONSE",
					content: "There are 2 days until Friday.",
				},
			},
			active,
		);
		active = t4Stop.active;

		// Turn 5 Stop: Model completes step 5 ("gg")
		const t5Stop = handle(
			{
				type: "stop",
				payload: { conversationId: "test-conv-sample-wf" },
				latestMessage: {
					stepIndex: 6,
					type: "PLANNER_RESPONSE",
					content: "Workflow finished - have a nice day!",
				},
			},
			active,
		);

		const turns = [
			{
				turn: "t1Pre",
				state: t1Pre.active?.state,
				message: stripAbsolutePath(
					t1Pre.response.injectSteps?.[0]?.ephemeralMessage ?? "",
				),
			},
			{ turn: "t1Stop", state: t1Stop.active?.state, response: t1Stop.response },
			{ turn: "t2Stop", state: t2Stop.active?.state, response: t2Stop.response },
			{ turn: "t3Stop", state: t3Stop.active?.state, response: t3Stop.response },
			{ turn: "t4Stop", state: t4Stop.active?.state, response: t4Stop.response },
			{ turn: "t5Stop", state: t5Stop.active?.state, response: t5Stop.response },
		];

		expect(turns).toMatchInlineSnapshot(`
			[
			  {
			    "message": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: Derive an API client from a recorded session]
			Step 1 of 6: record

			CONTEXT:
			This is a workflow to test the worfklow funcitions.

			INSTRUCTION:
			say "Hello to workflow test"

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("examples/sample-wf.md") or SKILL.md — steps are already loaded by the runner.",
			    "state": {
			      "iterationCount": 0,
			      "status": "active",
			      "step": 0,
			    },
			    "turn": "t1Pre",
			  },
			  {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: it is friday?

			CONTEXT:
			This is a workflow to test the worfklow funcitions.

			Evaluate condition: "it is friday?"

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "active",
			      "step": 1,
			    },
			    "turn": "t1Stop",
			  },
			  {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: it is friday? no (Level 1)

			CONTEXT:
			This is a workflow to test the worfklow funcitions.

			INSTRUCTION:
			echo hello monday

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 2,
			      "status": "active",
			      "step": 3,
			    },
			    "turn": "t2Stop",
			  },
			  {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: report (Level 1)

			CONTEXT:
			This is a workflow to test the worfklow funcitions.

			INSTRUCTION:
			report how many days until friday

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 3,
			      "status": "active",
			      "step": 4,
			    },
			    "turn": "t3Stop",
			  },
			  {
			    "response": {
			      "decision": "continue",
			      "reason": "[wf] Executing next step: gg

			CONTEXT:
			This is a workflow to test the worfklow funcitions.

			INSTRUCTION:
			report end of workflow - have a nice day

			Continue immediately and execute this step.",
			    },
			    "state": {
			      "iterationCount": 4,
			      "status": "active",
			      "step": 5,
			    },
			    "turn": "t4Stop",
			  },
			  {
			    "response": {
			      "decision": "allow",
			    },
			    "state": {
			      "iterationCount": 5,
			      "status": "finished",
			      "step": 6,
			    },
			    "turn": "t5Stop",
			  },
			]
		`);
	});
});
