import type { ActiveWorkflow } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { handlePre } from "./pre.ts";
import { handleStop } from "./stop.ts";

export { handlePre } from "./pre.ts";
export { handleStop } from "./stop.ts";

/**
 * Deterministic handler: dispatches to handleStop or handlePre
 * based on hook type.
 */
export function handle(
	info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	if (info.type === "stop") {
		return handleStop(info, active);
	} else if (info.type === "pre") {
		return handlePre(info, active);
	}
	throw new Error(`Unknown hook type: ${info.type}`);
}
