import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { ActiveWorkflow } from "../state.ts";
import { advanceStep } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatAdvanceReason, parseDecision } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * conditionPre: Injects the prompt asking the model to evaluate the condition.
 * Re-uses the unified step action.
 */
export const conditionPre = step;

/**
 * conditionStop: Evaluates model response, branches YES or NO, and advances.
 * Precondition: workflow must be active and current step must be a condition.
 */
export function conditionStop(
	info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	assert(
		active?.state.status === "active",
		"conditionStop requires an active workflow",
	);

	const currentStep = active.workflow.flatSteps[active.state.step];
	assert(
		currentStep?.type === "condition",
		"conditionStop requires current step to be a condition",
	);

	const totalSteps = active.workflow.flatSteps.length;
	const modelText = info.latestMessage?.content ?? "";
	const decision = parseDecision(modelText);
	logDebug("Condition evaluated (Stop)", {
		condition: currentStep.condition,
		decision,
	});

	const nextState = advanceStep(
		active.workflow.flatSteps,
		active.state,
		decision,
	);
	assert(nextState, "advanceStep must return next state for active workflow");
	const nextActive = { ...active, state: nextState };

	if (nextState.status === "finished") {
		logDebug("All workflow steps complete after condition", { totalSteps });
		return {
			active: nextActive,
			response: { decision: "allow" },
		};
	}

	if (nextState.status === "error") {
		logDebug("Condition workflow terminated on error", {
			error: nextState.error,
		});
		return {
			active: nextActive,
			response: { decision: "allow" },
		};
	}

	const nextTargetStep = active.workflow.flatSteps[nextState.step];
	const nextStepNum = nextState.step + 1;
	const reason = formatAdvanceReason(nextTargetStep, active.workflow.preamble);

	logDebug("Advancing after condition (auto)", {
		nextNum: nextStepNum,
		totalSteps,
		level: nextTargetStep.level,
	});

	return {
		active: nextActive,
		response: {
			decision: "continue",
			reason,
		},
	};
}
