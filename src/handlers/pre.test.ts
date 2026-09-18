import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { flattenWorkflow, type WorkflowAst } from "../workflow.ts";
import { handlePre } from "./pre.ts";

const sampleDef: WorkflowAst = {
	name: "Sample",
	steps: [
		{ type: "step", title: "First Step", instruction: "Do the first thing" },
		{
			type: "condition",
			title: "is ready?",
			condition: "is ready?",
			yes: {
				steps: [{ type: "step", title: "Deploy", instruction: "Deploy" }],
			},
			no: { steps: [{ type: "step", title: "Fix", instruction: "Fix" }] },
		},
	],
};

const mockResolver = () => ({ filePath: "/mock.json", workflow: sampleDef });

describe("handlers/pre.ts", () => {
	test("handlePre starts workflow on /wf <file>", () => {
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: {
				stepIndex: 1,
				type: "USER_INPUT",
				content: "/wf test.json",
			},
			workflowResolver: mockResolver,
		};
		const { active: nextActive, response } = handlePre(info, null);
		expect({ state: nextActive?.state, response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: Sample]
			Step 1 of 4: First Step

			INSTRUCTION:
			Do the first thing

			RULES:
			1. Start your response with: "Executing Step: First Step"
			2. Execute this specific step now.
			3. Do NOT jump ahead to subsequent steps.
			4. Conclude your response when this step is complete.
			5. Do NOT read or inspect the workflow file ("/mock.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			}
		`);
	});

	test("handlePre pauses active workflow on user conversational interruption", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: {
				stepIndex: 2,
				type: "USER_INPUT",
				content: "Stop and tell me a joke",
			},
		};
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const { active: nextActive, response } = handlePre(info, active);
		expect({ state: nextActive?.state, response }).toMatchInlineSnapshot(`
			{
			  "response": {},
			  "state": {
			    "iterationCount": 0,
			    "status": "paused",
			    "step": 0,
			  },
			}
		`);
	});

	test("handlePre executes /wf-next when paused", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: { stepIndex: 2, type: "USER_INPUT", content: "/wf-next" },
		};
		const active: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const { active: nextActive, response } = handlePre(info, active);
		expect({ state: nextActive?.state, response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: Sample]
			Step 1 of 4: First Step

			INSTRUCTION:
			Do the first thing

			RULES:
			1. Start your response with: "Executing Step: First Step"
			2. Execute this specific step now.
			3. Do NOT jump ahead to subsequent steps.
			4. Conclude your response when this step is complete.
			5. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 0,
			  },
			}
		`);
	});

	test("handlePre executes /wf-show, /wf-help, and /wf-stop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const initial: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 1,
			},
			workflow: {
				name: "Sample",
				filePath: "/mock.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const showNoArgRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 2,
					type: "USER_INPUT",
					content: "/wf-show",
				},
			},
			initial,
		);

		const stopRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 3,
					type: "USER_INPUT",
					content: "/wf-stop",
				},
			},
			initial,
		);

		const helpRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 4,
					type: "USER_INPUT",
					content: "/wf-help",
				},
			},
			null,
		);

		const showRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 5,
					type: "USER_INPUT",
					content: "/wf-show test.json",
				},
				workflowResolver: mockResolver,
			},
			initial,
		);

		const assertions = {
			showNoArg: {
				state: showNoArgRes.active?.state,
				response: showNoArgRes.response,
			},
			stop: { state: stopRes.active?.state, response: stopRes.response },
			help: { state: helpRes.active?.state, response: helpRes.response },
			show: { state: showRes.active?.state, response: showRes.response },
		};
		expect(assertions).toMatchInlineSnapshot(`
			{
			  "help": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			Show this message directly to the user:

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			        },
			      ],
			    },
			    "state": undefined,
			  },
			  "show": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: PAUSED]
			Workflow: Sample
			Step: 1 of 4 (Nesting Level 0)

			[WORKFLOW VISUALIZATION: Sample]
			Present the structure of workflow "Sample" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["▶ First Step"]
			    s1{{"<i>is ready?</i>"}}
			    s2["Deploy"]
			    s3["Fix"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    s1 -->|No| s3
			    style s0 stroke:#3b82f6,stroke-width:4px
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			▶ [CURRENT] - Step: First Step
			- If: is ready?
			  - Step: Deploy
			- Else:
			  - Step: Fix

			RULES:
			1. Do NOT read or inspect the workflow file ("/mock.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			        },
			      ],
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "paused",
			      "step": 0,
			    },
			  },
			  "showNoArg": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STATUS: PAUSED]
			Workflow: Sample
			Step: 1 of 4 (Nesting Level 0)

			[WORKFLOW VISUALIZATION: Sample]
			Present the structure of workflow "Sample" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["▶ First Step"]
			    s1{{"<i>is ready?</i>"}}
			    s2["Deploy"]
			    s3["Fix"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    s1 -->|No| s3
			    style s0 stroke:#3b82f6,stroke-width:4px
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			▶ [CURRENT] - Step: First Step
			- If: is ready?
			  - Step: Deploy
			- Else:
			  - Step: Fix

			RULES:
			1. Do NOT read or inspect the workflow file ("/mock.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			        },
			      ],
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "paused",
			      "step": 0,
			    },
			  },
			  "stop": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW STOPPED]
			Workflow "Sample" has been stopped.",
			        },
			      ],
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "finished",
			      "step": 0,
			    },
			  },
			}
		`);
	});

	test("handlePre terminates on runaway loop iteration limit", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
		};
		// flat has 4 steps, limit is 4 * 5 = 20
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 20, // limit is 20, next iteration will be 21 -> exceeded
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};

		const { active: nextActive, response } = handlePre(info, active);
		expect({ state: nextActive?.state, response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW RUNNER] Workflow terminated: Exceeded safety iteration limit (20).",
			      },
			    ],
			  },
			  "state": {
			    "error": "Workflow terminated: Exceeded safety iteration limit (20).",
			    "iterationCount": 20,
			    "status": "error",
			    "step": 0,
			  },
			}
		`);
	});

	test("handlePre injects condition evaluation prompt on condition step", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
		};
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1, // c1 condition
				iterationCount: 0,
			},
			workflow: {
				name: "Sample",
				filePath: "wf.json",
				steps: sampleDef.steps,
				flatSteps: flat,
			},
		};
		const { active: nextActive, response } = handlePre(info, active);
		expect({ state: nextActive?.state, response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: Sample]
			Step 2 of 4: is ready? (Condition Evaluation)
			Condition: "is ready?"

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is ready?".
			If needed, use tools to inspect the environment, files, date/time, or git state.

			Start your response with: "Checking condition: is ready?"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
			      },
			    ],
			  },
			  "state": {
			    "iterationCount": 0,
			    "status": "active",
			    "step": 1,
			  },
			}
		`);
	});
});
