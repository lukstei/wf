import { conditionStop } from "../actions/condition.ts";
import { nextStop } from "../actions/next.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { ActiveWorkflow } from "../state.ts";
import { failWorkflow, pauseWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";

/**
 * Handles the Stop lifecycle hook.
 * Dispatches to conditionStop or nextStop based on current step type.
 */
export function handleStop(
	info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	// If no workflow is active, allow stop
	if (active?.state.status !== "active") {
		return { active, response: { decision: "allow" } };
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
		const errorState = failWorkflow(active.state, errorMsg);
		return {
			active: errorState
				? { workflow: active.workflow, state: errorState }
				: active,
			response: { decision: "allow" },
		};
	}

	// If stopped due to cancellation or user interrupt, allow stop and pause active workflow
	if (
		info.payload.terminationReason &&
		/cancel|abort|interrupt/i.test(info.payload.terminationReason)
	) {
		logDebug("Allowing stop due to interruption", info.payload);
		const paused = pauseWorkflow(active.state);
		return {
			active: paused ? { workflow: active.workflow, state: paused } : active,
			response: { decision: "allow" },
		};
	}

	const currentStep = active.workflow.flatSteps[active.state.step];
	if (!currentStep) {
		return { active, response: { decision: "allow" } };
	}

	if (currentStep.type === "condition") {
		return conditionStop(info, active);
	}
	return nextStop(info, active);
}
