import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import { advanceStep } from "../transitions.ts";
import { flattenWorkflow } from "../workflow.ts";
import { nextPre, nextStop } from "./next.ts";
import { step } from "./step.ts";

const sampleGateWorkflow = {
	name: "GateTestFlow",
	steps: [
		{ type: "step" as const, title: "Step 1", instruction: "Do step 1" },
		{
			type: "gate" as const,
			title: "Confirm Migration",
			instruction: "Review database schema changes before applying.",
		},
		{ type: "step" as const, title: "Step 3", instruction: "Apply schema" },
	],
};

describe("Gate Semantics", () => {
	const flat = flattenWorkflow(sampleGateWorkflow.steps);

	test("gate step execution, transition, and approval snapshots", () => {
		const activeGateState: WorkflowState = {
			status: "active",
			workflow: {
				name: "GateTestFlow",
				filePath: "gate.json",
				flatSteps: flat,
			},
			currentStepIndex: 1,
			stepPending: true,
		};

		const stepInjectionResult = step(
			{ type: "pre", payload: { conversationId: "c1" } },
			activeGateState,
		);

		const advanceResult = advanceStep(activeGateState);

		const stopResult = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			activeGateState,
		);

		const pausedAfterGateState: WorkflowState = {
			status: "paused",
			workflow: {
				name: "GateTestFlow",
				filePath: "gate.json",
				flatSteps: flat,
			},
			currentStepIndex: 2,
			stepPending: false,
		};

		const nextPreResult = nextPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			pausedAfterGateState,
		);

		const assertions = {
			stepInjectionResult,
			advanceResult,
			stopResult,
			nextPreResult,
		};

		expect(assertions).toMatchInlineSnapshot(`
			{
			  "advanceResult": {
			    "currentStepIndex": 2,
			    "status": "paused",
			    "stepPending": false,
			    "workflow": {
			      "filePath": "gate.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "Do step 1",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "Step 1",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Review database schema changes before applying.",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Confirm Migration",
			          "type": "gate",
			        },
			        {
			          "index": 2,
			          "instruction": "Apply schema",
			          "level": 0,
			          "nextIndex": 3,
			          "title": "Step 3",
			          "type": "step",
			        },
			      ],
			      "name": "GateTestFlow",
			    },
			  },
			  "nextPreResult": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW PAUSED: GateTestFlow]
			Step 3 of 3: Step 3

			INSTRUCTION:
			Apply schema

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("gate.json") or SKILL.md — steps are already loaded by the runner.",
			        },
			      ],
			    },
			    "state": {
			      "currentStepIndex": 2,
			      "status": "paused",
			      "stepPending": true,
			      "workflow": {
			        "filePath": "gate.json",
			        "flatSteps": [
			          {
			            "index": 0,
			            "instruction": "Do step 1",
			            "level": 0,
			            "nextIndex": 1,
			            "title": "Step 1",
			            "type": "step",
			          },
			          {
			            "index": 1,
			            "instruction": "Review database schema changes before applying.",
			            "level": 0,
			            "nextIndex": 2,
			            "title": "Confirm Migration",
			            "type": "gate",
			          },
			          {
			            "index": 2,
			            "instruction": "Apply schema",
			            "level": 0,
			            "nextIndex": 3,
			            "title": "Step 3",
			            "type": "step",
			          },
			        ],
			        "name": "GateTestFlow",
			      },
			    },
			  },
			  "stepInjectionResult": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: GateTestFlow]
			Step 2 of 3: Confirm Migration

			INSTRUCTION:
			Review database schema changes before applying.

			NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.

			RULES:
			1. Execute this specific step now.
			2. Do NOT jump ahead to subsequent steps.
			3. Conclude your response when this step is complete.
			4. Do NOT read or inspect the workflow file ("gate.json") or SKILL.md — steps are already loaded by the runner.",
			        },
			      ],
			    },
			    "state": {
			      "currentStepIndex": 1,
			      "status": "active",
			      "stepPending": true,
			      "workflow": {
			        "filePath": "gate.json",
			        "flatSteps": [
			          {
			            "index": 0,
			            "instruction": "Do step 1",
			            "level": 0,
			            "nextIndex": 1,
			            "title": "Step 1",
			            "type": "step",
			          },
			          {
			            "index": 1,
			            "instruction": "Review database schema changes before applying.",
			            "level": 0,
			            "nextIndex": 2,
			            "title": "Confirm Migration",
			            "type": "gate",
			          },
			          {
			            "index": 2,
			            "instruction": "Apply schema",
			            "level": 0,
			            "nextIndex": 3,
			            "title": "Step 3",
			            "type": "step",
			          },
			        ],
			        "name": "GateTestFlow",
			      },
			    },
			  },
			  "stopResult": {
			    "response": {
			      "decision": "allow",
			    },
			    "state": {
			      "currentStepIndex": 2,
			      "status": "paused",
			      "stepPending": false,
			      "workflow": {
			        "filePath": "gate.json",
			        "flatSteps": [
			          {
			            "index": 0,
			            "instruction": "Do step 1",
			            "level": 0,
			            "nextIndex": 1,
			            "title": "Step 1",
			            "type": "step",
			          },
			          {
			            "index": 1,
			            "instruction": "Review database schema changes before applying.",
			            "level": 0,
			            "nextIndex": 2,
			            "title": "Confirm Migration",
			            "type": "gate",
			          },
			          {
			            "index": 2,
			            "instruction": "Apply schema",
			            "level": 0,
			            "nextIndex": 3,
			            "title": "Step 3",
			            "type": "step",
			          },
			        ],
			        "name": "GateTestFlow",
			      },
			    },
			  },
			}
		`);
	});
});
