import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage } from "../types.ts";
import { parseClaudeMessage } from "./claude.ts";
import { isVsCodeCopilotRoot } from "./copilot.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const codexHarness: HarnessAdapter = {
	id: "codex",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)) {
			return false;
		}
		return Boolean(
			env.PLUGIN_DATA ||
				env.CODEX_SESSION_ID ||
				env.CODEX_THREAD_ID ||
				payload.hookEventName !== undefined,
		);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.session_id ?? payload.sessionId ?? "default",
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
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);

		const toolCall = isTool
			? {
					name: String(payload.tool_name ?? payload.toolName ?? "unknown"),
					args: (payload.tool_input ?? payload.toolArgs ?? {}) as Record<
						string,
						unknown
					>,
				}
			: undefined;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "codex",
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
						suppressOutput: true,
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
					: typeof event.rawPayload.hookEventName === "string"
						? event.rawPayload.hookEventName
						: "UserPromptSubmit";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					systemMessage: "[WORKFLOW]",
					hookSpecificOutput: {
						hookEventName,
						additionalContext: text,
					},
					suppressOutput: true,
				}),
			};
		}

		if (event.type === "tool") {
			const isDeny = response.decision === "deny";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: isDeny ? "deny" : "allow",
						permissionDecisionReason: isDeny
							? response.reason || "Action blocked by workflow policy."
							: "",
					},
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},
};
