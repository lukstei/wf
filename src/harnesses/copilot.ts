import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage } from "../types.ts";
import { parseClaudeMessage } from "./claude.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export function isVsCodeCopilotRoot(pluginRoot?: string): boolean {
	if (!pluginRoot) return false;
	const segments = pluginRoot.split(/[\\/]+/);
	return (
		segments.includes("agent-plugins") &&
		pluginRoot.toLowerCase().includes(".vscode")
	);
}

export const copilotHarness: HarnessAdapter = {
	id: "copilot",

	detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(
			env.COPILOT_PLUGIN_DATA || isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT),
		);
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
			const ephemeralMessage =
				response.injectSteps?.[0]?.ephemeralMessage || response.message || "";
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
		return env.COPILOT_CONVERSATION_ID || env.VSCODE_COPILOT_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_PLUGIN_DATA || null;
	},
};
