import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import { step } from "./step.ts";

describe("actions/step.ts", () => {
	test("step injects formatted instruction prompt", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				steps: [],
				flatSteps: [
					{
						id: "s1",
						type: "step",
						title: "Build Step",
						instruction: "Run npm run build",
						level: 1,
						index: 0,
						nextIndex: 1,
					},
				],
			},
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, active);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: DeployApp]
			Step 1 of 1: Build Step (Nesting Level 1)

			INSTRUCTION:
			Run npm run build

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
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

	test("step injects formatted instruction prompt for root level step", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
				steps: [],
				flatSteps: [
					{
						id: "s1",
						type: "step",
						title: "Build Step",
						instruction: "Run npm run build",
						level: 0,
						index: 0,
						nextIndex: 1,
					},
				],
			},
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, active);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: DeployApp]
			Step 1 of 1: Build Step

			INSTRUCTION:
			Run npm run build

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("wf.json") or SKILL.md — steps are already loaded by the runner.",
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

	test("step asserts precondition when state is null or finished", () => {
		expect(() =>
			step({ type: "pre", payload: { conversationId: "c1" } }, null),
		).toThrow("Cannot execute step: workflow must be active or paused");

		const finishedActive: ActiveWorkflow = {
			state: {
				status: "finished",
				step: 1,
				iterationCount: 1,
			},
			workflow: { name: "Done", filePath: "wf.json", steps: [], flatSteps: [] },
		};
		expect(() =>
			step({ type: "pre", payload: { conversationId: "c1" } }, finishedActive),
		).toThrow("Cannot execute step: workflow must be active or paused");
	});

	test("step asserts precondition when currentStep is missing", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 5,
				iterationCount: 0,
			},
			workflow: {
				name: "Empty",
				filePath: "wf.json",
				steps: [],
				flatSteps: [],
			},
		};

		expect(() =>
			step({ type: "pre", payload: { conversationId: "c1" } }, active),
		).toThrow("Current step does not exist");
	});

	test("step formats and injects prompt when currentStep is a condition", () => {
		const active: ActiveWorkflow = {
			state: {
				status: "active",
				step: 0,
				iterationCount: 0,
			},
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
				steps: [],
				flatSteps: [
					{
						id: "c1",
						type: "condition",
						condition: "is ready?",
						level: 0,
						index: 0,
						nextIndex: 1,
					},
				],
			},
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, active);
		expect({ state: res.active?.state, response: res.response }).toMatchInlineSnapshot(`
			{
			  "response": {
			    "injectSteps": [
			      {
			        "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: CondFlow]
			Step 1 of 1: undefined (Condition Evaluation)
			Condition: "is ready?"

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is ready?".
			If needed, use tools to inspect the environment, files, date/time, or git state.
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
			    "step": 0,
			  },
			}
		`);
	});
});
