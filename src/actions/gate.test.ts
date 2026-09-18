import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
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
		const activeGate: ActiveWorkflow = {
			state: {
				status: "active",
				step: 1,
				iterationCount: 0,
			},
			workflow: {
				name: "GateTestFlow",
				filePath: "gate.json",
				steps: sampleGateWorkflow.steps,
				flatSteps: flat,
			},
		};

		const stepInjectionResult = step(
			{ type: "pre", payload: { conversationId: "c1" } },
			activeGate,
		);

		const advanceResult = advanceStep(flat, activeGate.state);

		const stopResult = nextStop(
			{ type: "stop", payload: { conversationId: "c1" } },
			activeGate,
		);

		const pausedAfterGate: ActiveWorkflow = {
			state: {
				status: "paused",
				step: 2,
				iterationCount: 0,
			},
			workflow: {
				name: "GateTestFlow",
				filePath: "gate.json",
				steps: sampleGateWorkflow.steps,
				flatSteps: flat,
			},
		};

		const nextPreResult = nextPre(
			{ type: "pre", payload: { conversationId: "c1" } },
			pausedAfterGate,
		);

		const assertions = {
			stepInjectionResult: {
				state: stepInjectionResult.active?.state,
				response: stepInjectionResult.response,
			},
			advanceResult,
			stopResult: {
				state: stopResult.active?.state,
				response: stopResult.response,
			},
			nextPreResult: {
				state: nextPreResult.active?.state,
				response: nextPreResult.response,
			},
		};

		expect(assertions).toMatchInlineSnapshot(`
			{
			  "advanceResult": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 2,
			  },
			  "nextPreResult": {
			    "response": {
			      "injectSteps": [
			        {
			          "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			[WORKFLOW ACTIVE: GateTestFlow]
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
			      "iterationCount": 0,
			      "status": "active",
			      "step": 2,
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
			      "iterationCount": 0,
			      "status": "active",
			      "step": 1,
			    },
			  },
			  "stopResult": {
			    "response": {
			      "decision": "allow",
			    },
			    "state": {
			      "iterationCount": 1,
			      "status": "paused",
			      "step": 2,
			    },
			  },
			}
		`);
	});
});
