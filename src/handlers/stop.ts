import { conditionStop } from "../actions/condition.ts";
import { nextStop } from "../actions/next.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { WorkflowState } from "../state.ts";
import { failWorkflow, pauseWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";

/**
 * Handles the Stop lifecycle hook.
 * Dispatches to conditionStop or nextStop based on current step type.
 */
export function handleStop(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	// If no workflow is active or paused, allow stop
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: state, response: { decision: "allow" } };
	}

	// If stopped due to error, transition to error status
	if (
		info.payload.error ||
		(info.payload.terminationReason &&
			/error/i.test(info.payload.terminationReason))
	) {
		const errorMsg =
			info.payload.error ||
			`Stopped with reason: ${info.payload.terminationReason}`;
		logDebug("Setting error state due to error termination", info.payload);
		return {
			state: failWorkflow(state, errorMsg),
			response: { decision: "allow" },
		};
	}

	// If stopped due to cancellation or user interrupt, allow stop and pause active workflow
	if (
		info.payload.terminationReason &&
		/cancel|abort|interrupt/i.test(info.payload.terminationReason)
	) {
		logDebug("Allowing stop due to interruption", info.payload);
		return {
			state: pauseWorkflow(state),
			response: { decision: "allow" },
		};
	}

	if (state.stepPending === false) {
		return { state: state, response: { decision: "allow" } };
	}

	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	if (!currentStep) {
		return { state: state, response: { decision: "allow" } };
	}

	if (currentStep.type === "condition") {
		return conditionStop(info, state);
	}
	return nextStop(info, state);
}
