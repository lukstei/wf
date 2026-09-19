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

function formatStepBody(
	step: FlatStep,
	isPrompt: boolean,
	title: string,
	fileRef = "",
): string[] {
	if (step.type === "condition") {
		const conditionText = step.condition || title;
		const evalText =
			step.instruction ||
			(isPrompt
				? `Evaluate whether the following condition is true or false: "${step.condition}".\nIf needed, use tools to inspect the environment, files, date/time, or git state.`
				: `Evaluate condition: "${step.condition}"`);

		const parts: string[] = [];
		if (isPrompt) {
			parts.push("INSTRUCTION:", evalText);
		} else {
			parts.push(evalText);
		}

		parts.push(
			"",
			`Start your response with: "Checking condition: ${conditionText}"`,
			"At the very end of your response, output strictly either:",
			"[DECISION: YES] or [DECISION: NO]",
		);

		if (isPrompt) {
			parts.push(
				"",
				"RULES:",
				`1. Do NOT read or inspect the workflow file${fileRef} or SKILL.md — steps are already loaded by the runner.`,
			);
		}
		return parts;
	}

	const isGate = step.type === "gate";
	const gateNote =
		"NOTE: This step is a human approval gate. After completing this step's instructions, remind the user they can proceed with '/wf-next' or stop with '/wf-stop'.";
	const startPrefix = isGate
		? `Start your response with: "Waiting at Gate: ${title}"`
		: `Start your response with: "Executing Step: ${title}"`;

	const parts: string[] = ["INSTRUCTION:", step.instruction || ""];

	if (isPrompt) {
		if (isGate) parts.push("", gateNote);
		parts.push(
			"",
			"RULES:",
			`1. ${startPrefix}`,
			"2. Execute this specific step now.",
			"3. Do NOT jump ahead to subsequent steps.",
			"4. Conclude your response when this step is complete.",
			`5. Do NOT read or inspect the workflow file${fileRef} or SKILL.md — steps are already loaded by the runner.`,
		);
	} else if (isGate) {
		parts.push("", startPrefix, gateNote);
	} else {
		parts.push("", startPrefix, "Continue immediately and execute this step.");
	}

	return parts;
}

export function formatStepPrompt(
	active: ActiveWorkflow,
	currentStep: FlatStep,
	stepNum: number,
	totalSteps: number,
): string {
	const wfName = active.workflow.name;
	const title = currentStep.title || `Step ${stepNum}`;
	const stepTitle = `: ${currentStep.title}`;
	const levelStr =
		currentStep.level > 0 ? ` (Nesting Level ${currentStep.level})` : "";
	const fileRef = active.workflow.filePath
		? ` ("${active.workflow.filePath}")`
		: "";

	const lines: string[] = [
		`[WORKFLOW ${active.state.status.toUpperCase()}: ${wfName}]`,
		`Step ${stepNum} of ${totalSteps}${stepTitle}${levelStr}${currentStep.type === "condition" ? " (Condition Evaluation)" : ""}`,
	];

	if (currentStep.type === "condition") {
		lines.push(`Condition: "${currentStep.condition}"`);
	}

	if (active.workflow.preamble) {
		lines.push("", "CONTEXT:", active.workflow.preamble);
	}

	lines.push("", ...formatStepBody(currentStep, true, title, fileRef));
	return lines.join("\n");
}

export function formatAdvanceReason(step: FlatStep, preamble?: string): string {
	const title = step.title || `Step ${step.index + 1}`;
	const levelStr = step.level > 0 ? ` (Level ${step.level})` : "";

	const lines: string[] = [`[wf] Executing next step: ${title}${levelStr}`];

	if (preamble) {
		lines.push("", "CONTEXT:", preamble);
	}

	lines.push("", ...formatStepBody(step, false, title));
	return lines.join("\n");
}
