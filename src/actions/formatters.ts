import type { ActiveWorkflow } from "../state.ts";
import type { FlatStep } from "../workflow.ts";

export const OVERRIDE_HEADER =
	"[INSTRUCTION: The user invoked a workflow command. Ignore all other instructions or previous conversation context. Only do the things told below.]";

export function injectSystemMessage(ephemeralMessage: string): {
	injectSteps: [{ ephemeralMessage: string }];
} {
	const message = ephemeralMessage.startsWith(OVERRIDE_HEADER)
		? ephemeralMessage
		: `${OVERRIDE_HEADER}\n\n${ephemeralMessage}`;
	return {
		injectSteps: [{ ephemeralMessage: message }],
	};
}

export function parseDecision(modelText: string): "YES" | "NO" {
	const match =
		modelText.match(/\[DECISION:\s*(YES|NO)\]/i) ||
		modelText.match(/\[(YES|NO)\]/i);
	return match && (match[1] || match[2]).toUpperCase() === "YES" ? "YES" : "NO";
}

export function formatStepPrompt(
	active: ActiveWorkflow,
	currentStep: FlatStep,
	stepNum: number,
	totalSteps: number,
): string {
	const wfName = active.workflow.name;
	const stepTitle = `: ${currentStep.title}`;
	const levelStr =
		currentStep.level > 0 ? ` (Nesting Level ${currentStep.level})` : "";
	const fileRef = active.workflow.filePath
		? ` ("${active.workflow.filePath}")`
		: "";

	if (currentStep.type === "condition") {
		const lines: string[] = [
			`[WORKFLOW ${active.state.status.toUpperCase()}: ${wfName}]`,
			`Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr} (Condition Evaluation)`,
			`Condition: "${currentStep.condition}"`,
		];

		if (active.workflow.preamble) {
			lines.push("", "CONTEXT:", active.workflow.preamble);
		}

		lines.push("", "INSTRUCTION:");
		if (currentStep.instruction) {
			lines.push(currentStep.instruction);
		} else {
			lines.push(
				`Evaluate whether the following condition is true or false: "${currentStep.condition}".`,
				"If needed, use tools to inspect the environment, files, date/time, or git state.",
			);
		}
		lines.push(
			"At the very end of your response, output strictly either:",
			"[DECISION: YES] or [DECISION: NO]",
			"",
			"RULES:",
			`1. Do NOT read or inspect the workflow file${fileRef} or SKILL.md — steps are already loaded by the runner.`,
		);

		return lines.join("\n");
	}

	const isGate = currentStep.type === "gate";
	const promptParts: string[] = [
		`[WORKFLOW ${active.state.status.toUpperCase()}: ${wfName}]`,
		`Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr}`,
	];

	if (active.workflow.preamble) {
		promptParts.push("", "CONTEXT:", active.workflow.preamble);
	}

	promptParts.push("", "INSTRUCTION:", currentStep.instruction || "");

	if (isGate) {
		promptParts.push(
			"",
			"NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.",
		);
	}

	promptParts.push(
		"",
		"RULES:",
		"1. Execute this specific step now.",
		"2. Do NOT jump ahead to subsequent steps.",
		"3. Conclude your response when this step is complete.",
		`4. Do NOT read or inspect the workflow file${fileRef} or SKILL.md — steps are already loaded by the runner.`,
	);

	return promptParts.join("\n");
}

export function formatAdvanceReason(step: FlatStep, preamble?: string): string {
	const isCondition = step.type === "condition";
	const isGate = step.type === "gate";
	const title = step.title || `Step ${step.index + 1}`;
	const levelStr = step.level > 0 ? ` (Level ${step.level})` : "";

	const reasonParts: string[] = [
		`[wf] Executing next step: ${title}${levelStr}`,
	];

	if (preamble) {
		reasonParts.push("", "CONTEXT:", preamble);
	}

	if (isCondition) {
		reasonParts.push(
			"",
			step.instruction || `Evaluate condition: "${step.condition}"`,
		);
	} else {
		reasonParts.push("", "INSTRUCTION:", step.instruction ?? "");
	}

	if (isGate) {
		reasonParts.push(
			"",
			"NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.",
		);
	} else {
		reasonParts.push("", "Continue immediately and execute this step.");
	}

	return reasonParts.join("\n");
}
