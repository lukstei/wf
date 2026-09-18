import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatStepPrompt, injectSystemMessage } from "./formatters.ts";

/**
 * Injects the prompt instructions for the current workflow step.
 * Precondition: state must be active or paused, and current step must exist.
 */
export function step(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	assert(
		state && (state.status === "active" || state.status === "paused"),
		"Cannot execute step: workflow must be active or paused",
	);

	const currentStep = state.workflow.flatSteps[state.step];
	assert(currentStep, "Current step does not exist");

	const stepNum = state.step + 1;
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
