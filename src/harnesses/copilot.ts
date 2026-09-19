import type { HookResponse } from "../types.ts";
import { defaultExtractLatestMessage } from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const copilotHarness: HarnessAdapter = {
	id: "copilot",

	detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(env.COPILOT_PLUGIN_DATA || env.COPILOT_SESSION_ID);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.sessionId ??
				payload.session_id ??
				payload.conversationId ??
				"default",
		);
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name ?? payload.hookEventName;

		const isStop =
			modeArg === "stop" ||
			eventName === "Stop" ||
			payload.stop_hook_active !== undefined ||
			payload.stopHookActive !== undefined;
		const isTool =
			modeArg === "tool" ||
			eventName === "PreToolUse" ||
			payload.tool_name !== undefined ||
			payload.toolName !== undefined;

		const type: "pre" | "stop" | "tool" = isStop
			? "stop"
			: isTool
				? "tool"
				: "pre";

		const prompt =
			typeof payload.prompt === "string"
				? payload.prompt
				: typeof payload.initial_prompt === "string"
					? payload.initial_prompt
					: typeof payload.initialPrompt === "string"
						? payload.initialPrompt
						: undefined;

		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);

		const rawToolName = payload.tool_name ?? payload.toolName;
		const rawToolArgs = payload.tool_input ?? payload.toolArgs;
		const toolCall =
			isTool && rawToolName
				? {
						name: String(rawToolName),
						args: (rawToolArgs as Record<string, unknown>) ?? {},
					}
				: undefined;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "copilot",
			conversationId,
			workspacePath,
			prompt,
			toolCall,
			isStop,
			stopHookActive,
			isInterrupted: false,
			latestMessage: null,
			rawPayload: payload,
		};

		partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
		return partialEvent;
	},

	extractLatestMessage: defaultExtractLatestMessage,

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.decision === "continue" && response.reason) {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "block",
						reason: response.reason,
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "pre") {
			const ephemeralMessage =
				response.injectSteps?.[0]?.ephemeralMessage || "";
			if (!ephemeralMessage) {
				return { exitCode: 0, stdout: "{}" };
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					additionalContext: ephemeralMessage,
				}),
			};
		}

		if (event.type === "tool") {
			const isDeny = response.decision === "deny";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					permissionDecision: isDeny ? "deny" : "allow",
					permissionDecisionReason: isDeny
						? response.reason || "Action blocked by workflow policy."
						: "",
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_PLUGIN_DATA || null;
	},
};
