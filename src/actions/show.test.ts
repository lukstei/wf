import * as path from "node:path";
import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import { stripAbsolutePath } from "../test-utils.ts";
import type { WorkflowAst } from "../workflow.ts";
import { show } from "./show.ts";

const sampleDef: WorkflowAst = {
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
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1,
				iterationCount: 2,
			},
			workflow: {
				name: "ActiveFlow",
				filePath: "/active.json",
				steps: [
					{ type: "step", title: "Step 0", instruction: "Step 0" },
					{
						type: "condition",
						title: "Check Day",
						condition: "day is fri",
						yes: {
							steps: [{ type: "step", title: "Step 2", instruction: "Step 2" }],
						},
					},
				],
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
			active,
			{ name: "show", args: {} },
		);

		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: ACTIVE]
			Workflow: ActiveFlow
			Step: 2 of 3 (Nesting Level 1)

			[WORKFLOW VISUALIZATION: ActiveFlow]
			Present the structure of workflow "ActiveFlow" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["Step 0"]
			    s1{{"<i>▶ Check Day</i>"}}
			    s2["Step 2"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    style s1 stroke:#3b82f6,stroke-width:4px
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			- Step: Step 0
			▶ [CURRENT] - If: Check Day
			  - Step: Step 2

			RULES:
			1. Do NOT read or inspect the workflow file ("/active.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 1,
			  },
			}
		`);
	});

	test("show reports finished and error states when invoked without argument", () => {
		const finishedActive: ActiveWorkflow = {
			state: {
				status: "finished",
				step: 1,
				iterationCount: 1,
			},
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				steps: [],
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
			finishedActive,
		);

		const errorActive: ActiveWorkflow = {
			state: {
				status: "error",
				step: 0,
				iterationCount: 0,
				error: "Boom!",
			},
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				steps: [],
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
		const errorRes = show(
			{ type: "pre", payload: { conversationId: "c1" } },
			errorActive,
		);

		expect({
			finished: { state: finishedRes.active?.state, response: finishedRes.response },
			error: { state: errorRes.active?.state, response: errorRes.response },
		}).toMatchInlineSnapshot(`
			{
			  "error": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: ERROR]
			Workflow: DeployApp
			Error: Boom!",
			        },
			      ],
			    },
			    "state": {
			      "error": "Boom!",
			      "iterationCount": 0,
			      "status": "error",
			      "step": 0,
			    },
			  },
			  "finished": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: FINISHED]
			Workflow "DeployApp" completed successfully.",
			        },
			      ],
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "finished",
			      "step": 1,
			    },
			  },
			}
		`);
	});

	test("show highlights active step when specified workflow matches active workflow", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1,
				iterationCount: 2,
			},
			workflow: {
				name: "SampleShow",
				filePath: "/sample.json",
				steps: sampleDef.steps,
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
			active,
			{ name: "show", args: { path: "/sample.json" } },
		);

		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: ACTIVE]
			Workflow: SampleShow
			Step: 2 of 2 (Nesting Level 0)

			[WORKFLOW VISUALIZATION: SampleShow]
			Present the structure of workflow "SampleShow" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["Step 1"]
			    s1{{"<i>▶ is friday</i>"}}
			    s2["hello friday"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    style s1 stroke:#3b82f6,stroke-width:4px
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			- Step: Step 1
			▶ [CURRENT] - If: is friday
			  - Step: hello friday

			RULES:
			1. Do NOT read or inspect the workflow file ("/sample.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 1,
			  },
			}
		`);
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

	test("show injects visualization prompt without modifying state", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1,
				iterationCount: 2,
			},
			workflow: {
				name: "ExistingFlow",
				filePath: "/existing.json",
				steps: [],
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
			active,
			{ name: "show", args: { path: "sample.json" } },
		);

		// State is preserved
		expect(res.active).toBe(active);

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

		expect(res.active).toBeNull();
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
