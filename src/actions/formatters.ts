import type { ExtractWorkflowState } from "../state.ts";
import type { FlatStep } from "../workflow.ts";

export function injectSystemMessage(ephemeralMessage: string): {
	injectSteps: [{ ephemeralMessage: string }];
} {
	return {
		injectSteps: [{ ephemeralMessage }],
	};
}

export function parseDecision(modelText: string): "YES" | "NO" {
	const match =
		modelText.match(/\[DECISION:\s*(YES|NO)\]/i) ||
		modelText.match(/\[(YES|NO)\]/i);
	return match && (match[1] || match[2]).toUpperCase() === "YES" ? "YES" : "NO";
}

export function formatStepPrompt(
	state: ExtractWorkflowState<"active" | "paused">,
	currentStep: FlatStep,
	stepNum: number,
	totalSteps: number,
): string {
	const wfName = state.workflow.name || "Workflow";
	const stepTitle = `: ${currentStep.title}`;
	const levelStr =
		currentStep.level > 0 ? ` (Nesting Level ${currentStep.level})` : "";
	const fileRef = state.workflow.filePath
		? ` ("${state.workflow.filePath}")`
		: "";

	if (currentStep.type === "condition") {
		const lines: string[] = [
			`[WORKFLOW ${state.status.toUpperCase()}: ${wfName}]`,
			`Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr} (Condition Evaluation)`,
			`Condition: "${currentStep.condition}"`,
		];

		if (state.workflow.preamble) {
			lines.push("", "CONTEXT:", state.workflow.preamble);
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
		`[WORKFLOW ${state.status.toUpperCase()}: ${wfName}]`,
		`Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr}`,
	];

	if (state.workflow.preamble) {
		promptParts.push("", "CONTEXT:", state.workflow.preamble);
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

export function formatAdvanceReason(
	summary: string,
	nextTargetStep: FlatStep,
	nextStepIndex: number,
	totalSteps: number,
	preamble?: string,
): string {
	const nextStepNum = nextStepIndex + 1;
	const isCondition = nextTargetStep.type === "condition";
	const isGate = nextTargetStep.type === "gate";
	const prefix = isCondition ? "If" : isGate ? "Gate" : "Step";
	const label = nextTargetStep.title || prefix;
	const title = `: ${nextTargetStep.title}`;
	const levelStr =
		nextTargetStep.level > 0 ? ` (Level ${nextTargetStep.level})` : "";

	const reasonParts = [
		`${prefix}: ${label}`,
		summary,
		`Now starting Step ${nextStepNum} of ${totalSteps}${title}${levelStr}`,
	];

	if (preamble) {
		reasonParts.push("", "CONTEXT:", preamble);
	}

	reasonParts.push(
		"",
		"INSTRUCTION:",
		isCondition
			? (nextTargetStep.instruction || `Evaluate condition: "${nextTargetStep.condition}"`)
			: (nextTargetStep.instruction ?? ""),
	);

	if (isGate) {
		reasonParts.push(
			"",
			"NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.",
		);
	} else {
		reasonParts.push("", "Continue immediately and execute this step.");
	}

	return reasonParts.filter((part) => part !== undefined).join("\n");
}
