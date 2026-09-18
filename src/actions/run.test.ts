import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { stripAbsolutePath } from "../test-utils.ts";
import type { WorkflowAst } from "../workflow.ts";
import { run } from "./run.ts";

const sampleDef: WorkflowAst = {
	name: "SampleRun",
	steps: [
		{ type: "step", title: "Step 1", instruction: "Initial step instruction" },
	],
};

const condDef: WorkflowAst = {
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
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => null,
			},
			null,
			{ name: "run", args: { path: "missing.json" } },
		);
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
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({ error: "Failed to parse JSON" }),
			},
			null,
			{ name: "run", args: { path: "bad.json" } },
		);
		expect(res.response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Failed to parse JSON

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

	test("run returns error when workflow has no steps", () => {
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({
					filePath: "/empty.json",
					workflow: { name: "Empty", steps: [] },
				}),
			},
			null,
			{ name: "run", args: { path: "empty.json" } },
		);
		expect(res.response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Workflow file "empty.json" contains no executable steps.

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
		expect({
			state: res.active?.state,
			workflowName: res.active?.workflow.name,
			response: res.response,
		}).toMatchInlineSnapshot(`
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
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("/sample.json") or SKILL.md — steps are already loaded by the runner.",
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
		const res = run(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				workflowResolver: () => ({ filePath: "/cond.json", workflow: condDef }),
			},
			null,
			{ name: "run", args: { path: "cond.json" } },
		);
		expect({
			state: res.active?.state,
			workflowName: res.active?.workflow.name,
			response: res.response,
		}).toMatchInlineSnapshot(`
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
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("/cond.json") or SKILL.md — steps are already loaded by the runner.",
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
			  "preamble": "This is a workflow to test the worfklow funcitions.",
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			  "workflowName": "Derive an API client from a recorded session",
			}
		`);
	});
});
