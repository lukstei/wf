import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import { step } from "./step.ts";

describe("actions/step.ts", () => {
	test("step injects formatted instruction prompt", () => {
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
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
			currentStepIndex: 0,
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, state);
		expect(res).toMatchInlineSnapshot(`
      {
        "response": {
          "injectSteps": [
            {
              "ephemeralMessage": "[WORKFLOW ACTIVE: DeployApp]
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
          "currentStepIndex": 0,
          "status": "active",
          "workflow": {
            "filePath": "wf.json",
            "flatSteps": [
              {
                "id": "s1",
                "index": 0,
                "instruction": "Run npm run build",
                "level": 1,
                "nextIndex": 1,
                "title": "Build Step",
                "type": "step",
              },
            ],
            "name": "DeployApp",
          },
        },
      }
    `);
	});

	test("step injects formatted instruction prompt for root level step", () => {
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "DeployApp",
				filePath: "wf.json",
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
			currentStepIndex: 0,
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, state);
		const msg = res.response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toContain("[WORKFLOW ACTIVE: DeployApp]");
		expect(msg).toContain("Step 1 of 1: Build Step");
		expect(msg).not.toContain("(Nesting Level");
	});

	test("step handles missing currentStep gracefully", () => {
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "Empty",
				filePath: "wf.json",
				flatSteps: [],
			},
			currentStepIndex: 5,
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, state);
		expect(res.response).toEqual({});
	});

	test("step returns empty response when currentStep is a condition", () => {
		const state: WorkflowState = {
			status: "active",
			workflow: {
				name: "CondFlow",
				filePath: "wf.json",
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
			currentStepIndex: 0,
		};

		const res = step({ type: "pre", payload: { conversationId: "c1" } }, state);
		expect(res.response).toEqual({});
	});
});
