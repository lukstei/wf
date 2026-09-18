import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
import { advanceStep } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import {
	formatAdvanceReason,
	formatStepPrompt,
	injectSystemMessage,
	parseDecision,
} from "./formatters.ts";

/**
 * conditionPre: Injects the prompt asking the model to evaluate the condition.
 */
export function conditionPre(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: state, response: {} };
	}

	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	if (currentStep?.type !== "condition") {
		return { state: state, response: {} };
	}

	const stepNum = state.currentStepIndex + 1;
	const totalSteps = state.workflow.flatSteps.length;
	const prompt = formatStepPrompt(state, currentStep, stepNum, totalSteps);

	logDebug("Injecting condition step (Pre)", {
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

/**
 * conditionStop: Evaluates model response, branches YES or NO, and advances.
 */
export function conditionStop(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	if (!state || state.status !== "active") {
		return { state: state, response: { decision: "allow" } };
	}

	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	if (currentStep?.type !== "condition") {
		return { state: state, response: { decision: "allow" } };
	}

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

	if (nextState?.status === "active") {
		const nextTargetStep =
			nextState.workflow.flatSteps[nextState.currentStepIndex];
		const nextStepNum = nextState.currentStepIndex + 1;
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
		nextStep: (nextState?.currentStepIndex ?? 0) + 1,
	});
	return {
		state: nextState,
		response: { decision: "allow" },
	};
}
