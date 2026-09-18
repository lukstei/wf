import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
import { advanceStep, resumeWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatAdvanceReason } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * nextPre: Handles /wf next user command in PreInvocation.
 * Resumes workflow in active mode and injects the current step.
 */
export function nextPre(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	assert(
		state && (state.status === "active" || state.status === "paused"),
		"No workflow is running",
	);

	const nextState = resumeWorkflow(state);
	return step(info, nextState);
}

/**
 * nextStop: Advances to the next step after action step completion in Stop hook.
 * Precondition: workflow must be active.
 */
export function nextStop(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	assert(state?.status === "active", "nextStop requires an active workflow");

	const nextState = advanceStep(state);

	if (nextState?.status === "finished") {
		logDebug("All workflow steps complete", {
			totalSteps: state.workflow.flatSteps.length,
		});
		return {
			state: nextState,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "active") {
		const nextTargetStep =
			nextState.workflow.flatSteps[nextState.currentStepIndex];
		const stepNum = nextState.currentStepIndex + 1;
		const totalSteps = nextState.workflow.flatSteps.length;
		const reason = formatAdvanceReason(
			nextTargetStep,
			nextState.workflow.preamble,
		);

		logDebug("Advancing to step (auto)", {
			nextNum: stepNum,
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

	// If paused (e.g. at a gate), yield back to user (wait for /wf next)
	logDebug("Step finished at gate, yielding to user", {
		nextStep: (nextState?.currentStepIndex ?? 0) + 1,
	});
	return {
		state: nextState,
		response: { decision: "allow" },
	};
}
