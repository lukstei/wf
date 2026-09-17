import { detectHarness, getHarness } from "../harnesses/index.ts";
import { logDebug } from "../lib/logDebug.ts";
import { loadState, saveState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handle } from "../wf.ts";
import { type EgressOutput, formatEgress } from "./egress.ts";
import { parseJsonSafe, readStdin } from "./stdin.ts";

export async function runShim(
	modeArg: string,
	rawInput?: string,
	env = process.env,
): Promise<EgressOutput> {
	const input = rawInput !== undefined ? rawInput : await readStdin();
	const payload = parseJsonSafe(input);

	const harnessId = detectHarness(payload, env);
	if (!harnessId) {
		return { exitCode: 0 };
	}

	const adapter = getHarness(harnessId);
	const event = adapter.normalize(payload, modeArg, env);

	logDebug.conversationId = event.conversationId;

	const rawTranscript =
		event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
	const transcriptPath =
		typeof rawTranscript === "string" ? rawTranscript : undefined;
	const artifactDirectoryPath =
		typeof event.rawPayload.artifactDirectoryPath === "string"
			? event.rawPayload.artifactDirectoryPath
			: undefined;

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
		latestMessage: event.latestMessage,
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
