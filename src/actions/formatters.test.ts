import { describe, expect, test } from "vitest";
import type { ActiveWorkflow } from "../state.ts";
import {
	formatAdvanceReason,
	formatStepPrompt,
	injectSystemMessage,
	OVERRIDE_HEADER,
	parseDecision,
} from "./formatters.ts";

describe("formatters.ts", () => {
	test("injectSystemMessage prefixes override header once", () => {
		const withoutHeader = injectSystemMessage("Do something");
		const withHeader = injectSystemMessage(
			`${OVERRIDE_HEADER}\n\nDo something`,
		);

		expect(withoutHeader).toEqual(withHeader);
		expect(withoutHeader).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]

			Do something",
			    },
			  ],
			}
		`);
	});

	test("parseDecision extracts YES/NO tokens or falls back to NO", () => {
		const cases = [
			parseDecision("I agree [DECISION: YES]"),
			parseDecision("I disagree [DECISION: NO]"),
			parseDecision("Option [YES]"),
			parseDecision("Option [NO]"),
			parseDecision("No decision token here"),
			parseDecision("[decision: yes]"),
			parseDecision("[no]"),
		];

		expect(cases).toMatchInlineSnapshot(`
			[
			  "YES",
			  "NO",
			  "YES",
			  "NO",
			  "NO",
			  "YES",
			  "NO",
			]
		`);
	});

	test("formatStepPrompt formats linear, condition, and gate steps", () => {
		const baseActive: ActiveWorkflow = {
			state: { status: "active", step: 0, iterationCount: 0 },
			workflow: {
				name: "Sample Workflow",
				filePath: "sample.json",
				preamble: "Global workflow context",
				steps: [],
				flatSteps: [],
			},
		};

		const linearPrompt = formatStepPrompt(
			baseActive,
			{
				index: 0,
				level: 0,
				type: "step",
				title: "Step One",
				instruction: "Run step one",
				nextIndex: 1,
			},
			1,
			3,
		);

		const gatePrompt = formatStepPrompt(
			baseActive,
			{
				index: 1,
				level: 1,
				type: "gate",
				title: "Approval Gate",
				instruction: "Check with user",
				nextIndex: 2,
			},
			2,
			3,
		);

		const conditionDefaultPrompt = formatStepPrompt(
			baseActive,
			{
				index: 2,
				level: 0,
				type: "condition",
				title: "Is Friday?",
				condition: "is it friday?",
				nextIndex: 3,
			},
			3,
			3,
		);

		const conditionCustomPrompt = formatStepPrompt(
			{
				...baseActive,
				workflow: {
					...baseActive.workflow,
					filePath: "",
					preamble: undefined,
				},
			},
			{
				index: 2,
				level: 0,
				type: "condition",
				title: "Is Friday?",
				condition: "is it friday?",
				instruction: "Check the local date command output.",
				nextIndex: 3,
			},
			3,
			3,
		);

		expect([
			linearPrompt,
			gatePrompt,
			conditionDefaultPrompt,
			conditionCustomPrompt,
		]).toMatchInlineSnapshot(`
			[
			  "[WORKFLOW ACTIVE: Sample Workflow]
			Step 1 of 3: Step One

			CONTEXT:
			Global workflow context

			INSTRUCTION:
			Run step one

			RULES:
			1. Start your response with: "Executing Step: Step One"
			2. Execute this specific step now.
			3. Do NOT jump ahead to subsequent steps.
			4. Conclude your response when this step is complete.
			5. Do NOT read or inspect the workflow file ("sample.json") or SKILL.md — steps are already loaded by the runner.",
			  "[WORKFLOW ACTIVE: Sample Workflow]
			Step 2 of 3: Approval Gate (Nesting Level 1)

			CONTEXT:
			Global workflow context

			INSTRUCTION:
			Check with user

			NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.

			RULES:
			1. Start your response with: "Waiting at Gate: Approval Gate"
			2. Execute this specific step now.
			3. Do NOT jump ahead to subsequent steps.
			4. Conclude your response when this step is complete.
			5. Do NOT read or inspect the workflow file ("sample.json") or SKILL.md — steps are already loaded by the runner.",
			  "[WORKFLOW ACTIVE: Sample Workflow]
			Step 3 of 3: Is Friday? (Condition Evaluation)
			Condition: "is it friday?"

			CONTEXT:
			Global workflow context

			INSTRUCTION:
			Evaluate whether the following condition is true or false: "is it friday?".
			If needed, use tools to inspect the environment, files, date/time, or git state.

			Start your response with: "Checking condition: is it friday?"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file ("sample.json") or SKILL.md — steps are already loaded by the runner.",
			  "[WORKFLOW ACTIVE: Sample Workflow]
			Step 3 of 3: Is Friday? (Condition Evaluation)
			Condition: "is it friday?"

			INSTRUCTION:
			Check the local date command output.

			Start your response with: "Checking condition: is it friday?"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]

			RULES:
			1. Do NOT read or inspect the workflow file or SKILL.md — steps are already loaded by the runner.",
			]
		`);
	});

	test("formatAdvanceReason formats linear, condition, and gate advance reasons", () => {
		const linear = formatAdvanceReason(
			{
				index: 0,
				level: 0,
				type: "step",
				title: "Linear Task",
				instruction: "Execute task",
				nextIndex: 1,
			},
			"Context preamble",
		);

		const gate = formatAdvanceReason({
			index: 1,
			level: 1,
			type: "gate",
			title: "User Review",
			instruction: "Wait for review",
			nextIndex: 2,
		});

		const condition = formatAdvanceReason({
			index: 2,
			level: 0,
			type: "condition",
			title: "Check Status",
			condition: "build passed",
			nextIndex: 3,
		});

		expect([linear, gate, condition]).toMatchInlineSnapshot(`
			[
			  "[wf] Executing next step: Linear Task

			CONTEXT:
			Context preamble

			INSTRUCTION:
			Execute task

			Start your response with: "Executing Step: Linear Task"
			Continue immediately and execute this step.",
			  "[wf] Executing next step: User Review (Level 1)

			INSTRUCTION:
			Wait for review

			Start your response with: "Waiting at Gate: User Review"
			NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.",
			  "[wf] Executing next step: Check Status

			Evaluate condition: "build passed"

			Start your response with: "Checking condition: build passed"
			At the very end of your response, output strictly either:
			[DECISION: YES] or [DECISION: NO]",
			]
		`);
	});
});
