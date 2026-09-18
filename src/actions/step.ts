import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { ActiveWorkflow } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatStepPrompt, injectSystemMessage } from "./formatters.ts";

/**
 * Injects the prompt instructions for the current workflow step.
 * Precondition: state must be active or paused, and current step must exist.
 */
export function step(
	_info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	assert(
		active && (active.state.status === "active" || active.state.status === "paused"),
		"Cannot execute step: workflow must be active or paused",
	);

	const currentStep = active.workflow.flatSteps[active.state.step];
	assert(currentStep, "Current step does not exist");

	const stepNum = active.state.step + 1;
	const totalSteps = active.workflow.flatSteps.length;
	const prompt = formatStepPrompt(active, currentStep, stepNum, totalSteps);

	logDebug("Injecting step", {
		stepNum,
		totalSteps,
		level: currentStep.level,
		status: active.state.status,
	});

	return {
		active,
		response: injectSystemMessage(prompt),
	};
}
