import { getLatestMessage } from "../lib/getLatestMessage.ts";
import { logDebug } from "../lib/logDebug.ts";
import { loadState, saveState } from "../state.ts";
import type { HookInfo, LatestMessage } from "../types.ts";
import { handle } from "../wf.ts";
import { type EgressOutput, formatEgress } from "./egress.ts";
import { normalizePayload, parseJsonSafe, readStdin } from "./normalizer.ts";

export async function runShim(
	modeArg: string,
	rawInput?: string,
	env = process.env,
): Promise<EgressOutput> {
	const input = rawInput !== undefined ? rawInput : await readStdin();
	const payload = parseJsonSafe(input);

	const event = normalizePayload(payload, modeArg, env);
	logDebug.conversationId = event.conversationId;

	// Resolve user message context:
	// AGY passes transcriptPath; Claude Code & Codex pass prompt directly in payload
	let latestMessage: LatestMessage | null = null;
	const transcriptPath =
		typeof event.rawPayload.transcriptPath === "string"
			? event.rawPayload.transcriptPath
			: undefined;
	const artifactDirectoryPath =
		typeof event.rawPayload.artifactDirectoryPath === "string"
			? event.rawPayload.artifactDirectoryPath
			: undefined;

	if (transcriptPath) {
		latestMessage = getLatestMessage(transcriptPath);
	} else if (event.prompt) {
		latestMessage = {
			stepIndex: 0,
			type: "USER_INPUT",
			content: event.prompt,
		};
	}

	const hookInfo: HookInfo = {
		type: event.type === "stop" ? "stop" : "pre",
		payload: {
			conversationId: event.conversationId,
			workspacePaths: [event.workspacePath],
			transcriptPath,
			artifactDirectoryPath,
			terminationReason: event.terminationReason,
			...event.rawPayload,
		},
		latestMessage,
	};

	const state = loadState(event.conversationId);
	const { state: nextState, response } = handle(hookInfo, state);

	if (nextState !== null && nextState !== state) {
		logDebug(`> Handled ${hookInfo.type}`, {
			payload: event.rawPayload,
			state: { ...state, workflow: undefined },
			nextState: { ...nextState, workflow: undefined },
			response,
		});
		saveState(event.conversationId, nextState);
	}

	return formatEgress(event.harness, event, response);
}
