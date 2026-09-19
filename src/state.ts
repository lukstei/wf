import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveStorageDirFromHarnesses } from "./harnesses/index.ts";

import type { CompiledWorkflow } from "./workflow.ts";

interface RunningWorkflowState {
	step: number;
	iterationCount: number;
}

export type WorkflowState =
	| ({ status: "active" } & RunningWorkflowState)
	| ({ status: "paused" } & RunningWorkflowState)
	| ({ status: "finished" } & RunningWorkflowState)
	| ({ status: "error"; error: string } & RunningWorkflowState);

export interface ActiveWorkflow {
	state: WorkflowState;
	workflow: CompiledWorkflow;
}

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

export function getWorkflowPath(
	conversationId: string,
	env?: NodeJS.ProcessEnv,
): string {
	return path.join(getStorageBaseDir(env), conversationId, "workflow.json");
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

export function loadWorkflow(
	conversationId: string,
	env?: NodeJS.ProcessEnv,
): CompiledWorkflow | null {
	try {
		const file = getWorkflowPath(conversationId, env);
		if (!fs.existsSync(file)) return null;
		const data = JSON.parse(fs.readFileSync(file, "utf-8"));
		if (
			!data ||
			typeof data !== "object" ||
			!data.name ||
			!Array.isArray(data.flatSteps)
		) {
			return null;
		}
		return data as CompiledWorkflow;
	} catch {
		return null;
	}
}

export function loadActiveWorkflow(
	conversationId: string,
	env?: NodeJS.ProcessEnv,
): ActiveWorkflow | null {
	const state = loadState(conversationId, env);
	if (!state) return null;
	const workflow = loadWorkflow(conversationId, env);
	if (!workflow) return null;
	return { state, workflow };
}

export function saveWorkflow(
	conversationId: string,
	workflow: CompiledWorkflow,
	env?: NodeJS.ProcessEnv,
): void {
	try {
		const file = getWorkflowPath(conversationId, env);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify(workflow, null, 2), "utf-8");
	} catch {
		// Ignore
	}
}

export function saveState(
	conversationId: string,
	state: WorkflowState,
	env?: NodeJS.ProcessEnv,
): void {
	try {
		const file = getStatePath(conversationId, env);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
	} catch {
		// Ignore
	}
}
