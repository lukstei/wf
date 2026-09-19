import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { stripAbsolutePath } from "../test-utils.ts";
import { run } from "./run.ts";

const fixturesDir = path.resolve(
	import.meta.dirname,
	"../../fixtures/workflows",
);
const fixture = (name: string) => path.join(fixturesDir, name);
const info = () => ({
	type: "pre" as const,
	payload: { conversationId: "c1" },
});

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
		expect(res.response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Missing workflow file path for /wf.

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    },
			  ],
			}
		`);
	});

	test("run returns error message when file is not found", () => {
		const res = run(info(), null, {
			name: "run",
			args: { path: "missing.json" },
		});
		expect(res.response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Workflow file not found: "missing.json". Please check the path and try again.

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    },
			  ],
			}
		`);
	});

	test("run returns error message when file has syntax error", () => {
		const res = run(info(), null, {
			name: "run",
			args: { path: fixture("bad.json") },
		});
		expect(
			stripAbsolutePath(res.response.injectSteps?.[0]?.ephemeralMessage ?? ""),
		).toContain("Failed to parse workflow JSON");
	});

	test("run returns error when workflow has no steps", () => {
		const res = run(info(), null, {
			name: "run",
			args: { path: fixture("empty.json") },
		});
		expect(
			stripAbsolutePath(res.response.injectSteps?.[0]?.ephemeralMessage ?? ""),
		).toContain("does not contain any steps");
	});

	test("run initializes state and injects step 0 for action step", () => {
		const res = run(info(), null, {
			name: "run",
			args: { path: fixture("sample-run.json") },
		});
		expect(
			stripAbsolutePath({
				state: res.active?.state,
				workflowName: res.active?.workflow.name,
				response: res.response,
			}),
		).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: SampleRun]
			Step 1 of 1: Step 1

			INSTRUCTION:
			Initial step instruction

			RULES:
			1. Start your response with: "Executing Step: Step 1"
			2. Execute this specific step now.
			3. Do NOT jump ahead to subsequent steps.
			4. Conclude your response when this step is complete.
			5. Do NOT read or inspect the workflow file ("fixtures/workflows/sample-run.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			  "workflowName": "SampleRun",
			}
		`);
	});

	test("run initializes state and injects step 0 for condition step", () => {
		const res = run(info(), null, {
			name: "run",
			args: { path: fixture("cond-run.json") },
		});
		expect(
			stripAbsolutePath({
				state: res.active?.state,
				workflowName: res.active?.workflow.name,
				response: res.response,
			}),
		).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: CondRun]
			Step 1 of 3: is ready? (Condition Evaluation)
			Condition: "is ready?"

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is ready?".
			If needed, use tools to inspect the environment, files, date/time, or git state.

			Start your response with: "Checking condition: is ready?"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("fixtures/workflows/cond-run.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			  "workflowName": "CondRun",
			}
		`);
	});

	test("run executes real sample-wf.md workflow with preamble injection", () => {
		const workspaceRoot = path.resolve(import.meta.dirname, "../..");
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
		expect({
			state: res.active?.state,
			workflowName: res.active?.workflow.name,
			preamble: res.active?.workflow.preamble,
			message: stripAbsolutePath(
				res.response.injectSteps?.[0]?.ephemeralMessage ?? "",
			),
		}).toMatchInlineSnapshot(`
			{
			  "message": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Workflow file not found: "examples/sample-wf.md". Please check the path and try again.

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			  "preamble": undefined,
			  "state": undefined,
			  "workflowName": undefined,
			}
		`);
	});
});
