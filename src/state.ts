import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveStorageDirFromHarnesses } from "./harnesses/index.ts";

import type { WorkflowInfo } from "./workflow.ts";

interface RunningWorkflowState {
	step: number;
	workflow: WorkflowInfo;
	iterationCount: number;
}

export type WorkflowState =
	| ({ status: "active" } & RunningWorkflowState)
	| ({ status: "paused" } & RunningWorkflowState)
	| ({ status: "finished" } & RunningWorkflowState)
	| ({ status: "error"; error: string } & RunningWorkflowState);

export type ExtractWorkflowState<T extends WorkflowState["status"]> = Extract<
	WorkflowState,
	{ status: T }
>;

export function getStorageBaseDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return resolveStorageDirFromHarnesses(env) || path.join(os.tmpdir(), "wf");
}

export function getStatePath(
	conversationId: string,
	env?: NodeJS.ProcessEnv,
): string {
	return path.join(getStorageBaseDir(env), conversationId, "state.json");
}

export function getDebugLogPath(
	conversationId?: string,
	env?: NodeJS.ProcessEnv,
): string {
	const base = getStorageBaseDir(env);
	return conversationId
		? path.join(base, conversationId, "debug.log")
		: path.join(base, "debug.log");
}

export function loadState(
	conversationId: string,
	env?: NodeJS.ProcessEnv,
): WorkflowState | null {
	try {
		const file = getStatePath(conversationId, env);
		if (!fs.existsSync(file)) return null;
		const data = JSON.parse(fs.readFileSync(file, "utf-8"));
		if (!data || typeof data !== "object" || !data.status) return null;
		return data as WorkflowState;
	} catch {
		return null;
	}
}

export function saveState(
	conversationId: string,
	state: WorkflowState,
	env?: NodeJS.ProcessEnv,
) {
	try {
		const file = getStatePath(conversationId, env);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
	} catch {
		// Ignore
	}
}
