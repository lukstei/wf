import { handle } from "../handlers/index.ts";
import { detectHarness, getHarness } from "../harnesses/index.ts";
import type { EgressOutput } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import { loadActiveWorkflow, saveState, saveWorkflow } from "../state.ts";
import type { HookInfo } from "../types.ts";
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

	const hookInfo: HookInfo = {
		type: event.type === "stop" ? "stop" : "pre",
		payload: {
			conversationId: event.conversationId,
			workspacePaths: [event.workspacePath],
			transcriptPath,
			terminationReason: event.terminationReason,
			...event.rawPayload,
		},
		latestMessage: event.latestMessage,
	};

	const active = loadActiveWorkflow(event.conversationId, env);
	const { active: nextActive, response } = handle(hookInfo, active);

	if (nextActive !== null && nextActive !== active) {
		logDebug(`> Handled ${hookInfo.type}`, {
			payload: event.rawPayload,
			state: active?.state,
			nextState: nextActive.state,
			response,
		});
		if (!active || active.workflow !== nextActive.workflow) {
			saveWorkflow(event.conversationId, nextActive.workflow, env);
		}
		saveState(event.conversationId, nextActive.state, env);
	}

	return adapter.formatEgress(event, response);
}
