import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatStepPrompt, injectSystemMessage } from "./formatters.ts";

/**
 * Step action: injects instruction prompt for a standard action step.
 */
export function step(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: state, response: {} };
	}

	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	if (
		!currentStep ||
		(currentStep.type !== "step" && currentStep.type !== "gate")
	) {
		return { state: state, response: {} };
	}

	const stepNum = state.currentStepIndex + 1;
	const totalSteps = state.workflow.flatSteps.length;
	const prompt = formatStepPrompt(state, currentStep, stepNum, totalSteps);

	logDebug("Injecting step", {
		stepNum,
		totalSteps,
		level: currentStep.level,
		status: state.status,
	});

	return {
		state: state,
		response: injectSystemMessage(prompt),
	};
}
