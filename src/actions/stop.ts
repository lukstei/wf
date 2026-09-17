import type { WorkflowState } from "../state.ts";
import { stopWorkflowState } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { injectSystemMessage } from "./formatters.ts";

/**
 * Stop action: stops and resets the active or paused workflow.
 */
export function stopWorkflow(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	const result = stopWorkflowState(state);
	if (!result.wasRunning) {
		return {
			state: result.state,
			response: injectSystemMessage(
				"[WORKFLOW STATUS]\nNo workflow is currently running.",
			),
		};
	}

	return {
		state: result.state,
		response: injectSystemMessage(
			`[WORKFLOW STOPPED]\nWorkflow "${result.workflowName}" has been stopped.`,
		),
	};
}
