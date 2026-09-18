import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage } from "../types.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export function parseAgyMessage(
	item: Record<string, unknown>,
): LatestMessage | null {
	const isUser = item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
	const isModel =
		(item.type === "PLANNER_RESPONSE" || item.source === "MODEL") &&
		item.type !== "GENERIC";

	if ((isUser || isModel) && typeof item.content === "string") {
		return {
			stepIndex: typeof item.step_index === "number" ? item.step_index : 0,
			type: isUser ? "USER_INPUT" : "PLANNER_RESPONSE",
			source: typeof item.source === "string" ? item.source : undefined,
			content: item.content,
		};
	}

	return null;
}

export const agyHarness: HarnessAdapter = {
	id: "agy",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (env.AGY_HOOK_ACTIVE) {
			return true;
		}
		if (
			Array.isArray(payload.workspacePaths) ||
			payload.executionNum !== undefined ||
			payload.stepIdx !== undefined ||
			payload.invocationNum !== undefined ||
			payload.artifactDirectoryPath !== undefined
		) {
			return true;
		}
		if (payload.conversationId !== undefined && !payload.session_id) {
			return true;
		}
		return false;
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(payload.conversationId ?? "default");
		const workspacePaths = Array.isArray(payload.workspacePaths)
			? (payload.workspacePaths as unknown[])
			: undefined;
		const workspacePath = String(
			workspacePaths?.[0] ?? payload.cwd ?? env.PWD ?? ".",
		);

		const terminationReason =
			typeof payload.terminationReason === "string"
				? payload.terminationReason
				: undefined;

		const isStop =
			modeArg === "stop" ||
			Boolean(terminationReason && payload.invocationNum === undefined);
		const isTool = modeArg === "tool" || payload.toolCall !== undefined;

		const type: "pre" | "stop" | "tool" = isStop
			? "stop"
			: isTool
				? "tool"
				: "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const isInterrupted = Boolean(
			terminationReason && /cancel|abort|interrupt/i.test(terminationReason),
		);
		const stopHookActive = Boolean(
			typeof payload.executionNum === "number" && payload.executionNum > 1,
		);

		const rawToolCall = payload.toolCall as
			| { name?: string; args?: Record<string, unknown> }
			| undefined;
		const toolCall =
			isTool && rawToolCall
				? {
						name: String(rawToolCall.name ?? "unknown"),
						args: rawToolCall.args ?? {},
					}
				: undefined;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "agy",
			conversationId,
			workspacePath,
			prompt,
			toolCall,
			isStop,
			stopHookActive,
			terminationReason,
			isInterrupted,
			latestMessage: null,
			rawPayload: payload,
		};

		partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
		return partialEvent;
	},

	extractLatestMessage(event: NormalizedEvent): LatestMessage | null {
		const invocationNum =
			typeof event.rawPayload.invocationNum === "number"
				? event.rawPayload.invocationNum
				: undefined;
		if (
			event.type === "pre" &&
			invocationNum !== undefined &&
			invocationNum > 1
		) {
			return null;
		}

		const rawTranscript =
			event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
		if (typeof rawTranscript === "string") {
			const msg = getLatestMessage(rawTranscript, parseAgyMessage);
			if (msg) return msg;
		}

		if (event.type === "stop") {
			const rawAssistant =
				event.rawPayload.last_assistant_message ??
				event.rawPayload.lastAssistantMessage;
			if (typeof rawAssistant === "string" && rawAssistant.length > 0) {
				return {
					stepIndex: 0,
					type: "PLANNER_RESPONSE",
					content: rawAssistant,
				};
			}
		}

		if (event.prompt) {
			return {
				stepIndex: 0,
				type: "USER_INPUT",
				content: event.prompt,
			};
		}
		return null;
	},

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.decision === "continue" && response.reason) {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "continue",
						reason: response.reason,
					}),
				};
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({ decision: "allow" }),
			};
		}

		if (event.type === "pre") {
			const ephemeralMessage =
				response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
			if (!ephemeralMessage) {
				return { exitCode: 0, stdout: "{}" };
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					injectSteps: [{ ephemeralMessage }],
				}),
			};
		}

		if (event.type === "tool") {
			const isDeny = response.decision === "deny";
			const reason = response.reason || "Action blocked by workflow policy.";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					decision: isDeny ? "deny" : "allow",
					...(isDeny ? { reason } : {}),
					...(response.overwrite ? { overwrite: response.overwrite } : {}),
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.ANTIGRAVITY_CONVERSATION_ID || env.AGY_CONVERSATION_ID || null;
	},
};
