import type { ActiveWorkflow } from "./state.ts";

interface HookPayload {
	conversationId: string;
	workspacePaths?: string[];
	transcriptPath?: string;
	invocationNum?: number;
	executionNum?: number;
	terminationReason?: string;
	error?: string;
}

export interface LatestMessage {
	type: string;
	content: string;
}

export interface HookInfo {
	type: "pre" | "stop";
	payload: HookPayload;
	latestMessage?: LatestMessage | null;
}

export interface HookResponse {
	decision?: string;
	reason?: string;
	injectSteps?: Array<{ ephemeralMessage?: string }>;
	overwrite?: unknown;
}

export interface HandleResult {
	active: ActiveWorkflow | null;
	response: HookResponse;
}
