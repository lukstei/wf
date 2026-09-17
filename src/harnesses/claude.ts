import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage } from "../types.ts";
import { isVsCodeCopilotRoot } from "./copilot.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export function parseClaudeMessage(
	item: Record<string, unknown>,
): LatestMessage | null {
	if (
		item.role === "assistant" ||
		(item.message as Record<string, unknown>)?.role === "assistant"
	) {
		const msg = (item.message ?? item) as {
			content?: Array<{ type?: string; text?: string }>;
		};
		if (Array.isArray(msg.content)) {
			const textBlock = msg.content.find((c) => c.type === "text");
			if (typeof textBlock?.text === "string") {
				return {
					stepIndex: 0,
					type: "PLANNER_RESPONSE",
					content: textBlock.text,
				};
			}
		}
	}

	if (item.role === "user" && typeof item.content === "string") {
		return {
			stepIndex: 0,
			type: "USER_INPUT",
			content: item.content,
		};
	}

	return null;
}

export const claudeHarness: HarnessAdapter = {
	id: "claude",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)) {
			return false;
		}
		return Boolean(
			env.CLAUDE_PROJECT_DIR ||
				(env.CLAUDE_PLUGIN_ROOT && !env.PLUGIN_DATA) ||
				payload.hook_event_name !== undefined ||
				payload.stop_hook_active !== undefined ||
				payload.session_id !== undefined,
		);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(payload.session_id ?? "default");
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name;

		const isStop =
			modeArg === "stop" ||
			eventName === "Stop" ||
			payload.stop_hook_active !== undefined;
		const isTool =
			modeArg === "tool" ||
			eventName === "PreToolUse" ||
			payload.tool_name !== undefined;

		const type: "pre" | "stop" | "tool" = isStop
			? "stop"
			: isTool
				? "tool"
				: "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const stopHookActive = Boolean(payload.stop_hook_active);

		const toolCall = isTool
			? {
					name: String(payload.tool_name ?? "unknown"),
					args: (payload.tool_input as Record<string, unknown>) ?? {},
				}
			: undefined;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "claude",
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

	extractLatestMessage(event: NormalizedEvent): LatestMessage | null {
		if (event.type === "stop") {
			const raw =
				event.rawPayload.last_assistant_message ??
				event.rawPayload.lastAssistantMessage;
			if (typeof raw === "string" && raw.length > 0) {
				return {
					stepIndex: 0,
					type: "PLANNER_RESPONSE",
					content: raw,
				};
			}
			const transcript =
				event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
			if (typeof transcript === "string") {
				return getLatestMessage(transcript, parseClaudeMessage);
			}
			return null;
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
						decision: "block",
						reason: response.reason,
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "pre") {
			const text =
				response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
			if (!text) {
				return { exitCode: 0, stdout: "{}" };
			}
			const hookEventName =
				typeof event.rawPayload.hook_event_name === "string"
					? event.rawPayload.hook_event_name
					: "UserPromptSubmit";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					hookSpecificOutput: {
						hookEventName,
						additionalContext: text,
					},
				}),
			};
		}

		if (event.type === "tool") {
			if (response.decision === "deny") {
				return {
					exitCode: 2,
					stderr: response.reason || "Action blocked by workflow policy.",
				};
			}
			return { exitCode: 0 };
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},
};
