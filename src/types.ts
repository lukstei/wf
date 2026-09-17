import type { WorkflowState } from "./state.ts";
import type { WorkflowDef } from "./workflow.ts";

interface HookPayload {
	conversationId: string;
	workspacePaths?: string[];
	transcriptPath?: string;
	artifactDirectoryPath?: string;
	modelName?: string;
	invocationNum?: number;
	initialNumSteps?: number;
	executionNum?: number;
	terminationReason?: string;
	error?: string;
	fullyIdle?: boolean;
	[key: string]: unknown;
}

export interface LatestMessage {
	stepIndex: number;
	type: string;
	source?: string;
	content: string;
}

export interface HookInfo {
	type: "pre" | "stop";
	payload: HookPayload;
	latestMessage?: LatestMessage | null;
	workflowResolver?: (
		targetPath: string,
		workspacePaths?: string[],
	) => { filePath: string; workflow: WorkflowDef } | { error: string } | null;
}

export interface HookResponse {
	decision?: string;
	reason?: string;
	message?: string;
	injectSteps?: Array<{ ephemeralMessage?: string }>;
	overwrite?: unknown;
	[key: string]: unknown;
}

export interface HandleResult {
	state: WorkflowState | null;
	response: HookResponse;
}
