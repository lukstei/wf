import { handlePre } from "./handlers/pre.ts";
import { handleStop } from "./handlers/stop.ts";
import type { WorkflowState } from "./state.ts";
import type { HandleResult, HookInfo } from "./types.ts";

/**
 * Deterministic handler: dispatches to handleStop or handlePre
 * based on hook type.
 */
export function handle(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	if (info.type === "stop") {
		return handleStop(info, state);
	} else if (info.type === "pre") {
		return handlePre(info, state);
	}
	throw new Error(`Unknown hook type: ${info.type}`);
}
