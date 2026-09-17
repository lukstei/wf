import * as fs from "node:fs";
import type { WorkflowInfo } from "./workflow.ts";

interface RunningWorkflowState {
	currentStepIndex: number;
	workflow: WorkflowInfo;
	iterationCount?: number;
	stepPending?: boolean;
}

export type WorkflowState =
	| ({ status: "active" } & RunningWorkflowState)
	| ({ status: "paused" } & RunningWorkflowState)
	| {
			status: "finished";
			workflow: WorkflowInfo;
			currentStepIndex?: number;
			iterationCount?: number;
			stepPending?: boolean;
	  }
	| ({ status: "error"; error: string } & RunningWorkflowState);

export type ExtractWorkflowState<T extends WorkflowState["status"]> = Extract<
	WorkflowState,
	{ status: T }
>;

export function getStatePath(conversationId: string): string {
	return `/tmp/wf-state-${conversationId}.json`;
}

export function loadState(conversationId: string): WorkflowState | null {
	try {
		const file = getStatePath(conversationId);
		if (!fs.existsSync(file)) return null;
		const data = JSON.parse(fs.readFileSync(file, "utf-8"));
		if (!data || typeof data !== "object" || !data.status) return null;
		return data as WorkflowState;
	} catch {
		return null;
	}
}

export function saveState(conversationId: string, state: WorkflowState) {
	try {
		const file = getStatePath(conversationId);
		fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
	} catch {
		// Ignore
	}
}
