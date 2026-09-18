import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
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
	state: WorkflowState | null,
): HandleResult {
	assert(
		state?.status === "active",
		"conditionStop requires an active workflow",
	);

	const currentStep = state.workflow.flatSteps[state.step];
	assert(
		currentStep?.type === "condition",
		"conditionStop requires current step to be a condition",
	);

	const totalSteps = state.workflow.flatSteps.length;
	const modelText = info.latestMessage?.content ?? "";
	const decision = parseDecision(modelText);
	logDebug("Condition evaluated (Stop)", {
		condition: currentStep.condition,
		decision,
	});

	const nextState = advanceStep(state, decision);

	if (nextState?.status === "finished") {
		logDebug("All workflow steps complete after condition", { totalSteps });
		return {
			state: nextState,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "error") {
		logDebug("Condition workflow terminated on error", {
			error: nextState.error,
		});
		return {
			state: nextState,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "active") {
		const nextTargetStep = nextState.workflow.flatSteps[nextState.step];
		const nextStepNum = nextState.step + 1;
		const reason = formatAdvanceReason(
			nextTargetStep,
			nextState.workflow.preamble,
		);

		logDebug("Advancing after condition (auto)", {
			nextNum: nextStepNum,
			totalSteps,
			level: nextTargetStep.level,
		});

		return {
			state: nextState,
			response: {
				decision: "continue",
				reason,
			},
		};
	}

	// Paused mode: yield to user
	logDebug("Condition finished in paused mode, yielding to user", {
		nextStep: (nextState?.step ?? 0) + 1,
	});
	return {
		state: nextState,
		response: { decision: "allow" },
	};
}
