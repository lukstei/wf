import type { ActiveWorkflow } from "../state.ts";
import { stopWorkflowState } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { injectSystemMessage } from "./formatters.ts";

/**
 * Stop action: stops and resets the active or paused workflow.
 */
export function stopWorkflow(
	_info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	const result = stopWorkflowState(
		active?.state ?? null,
		active?.workflow.name,
	);
	if (!result.wasRunning || !active || !result.state) {
		return {
			active,
			response: injectSystemMessage(
				"[WORKFLOW STATUS]\nNo workflow is currently running.",
			),
		};
	}

	return {
		active: {
			workflow: active.workflow,
			state: result.state,
		},
		response: injectSystemMessage(
			`[WORKFLOW STOPPED]\nWorkflow "${result.workflowName}" has been stopped.`,
		),
	};
}
