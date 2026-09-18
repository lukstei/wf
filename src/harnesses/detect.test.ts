import { describe, expect, it } from "vitest";
import { isVsCodeCopilotRoot } from "./copilot.ts";
import {
	detectHarness,
	resolveConversationIdFromHarnesses,
	resolveStorageDirFromHarnesses,
} from "./index.ts";

describe("detectHarness", () => {
	describe("isVsCodeCopilotRoot", () => {
		it("returns false for undefined or empty paths", () => {
			expect(isVsCodeCopilotRoot()).toBe(false);
			expect(isVsCodeCopilotRoot("")).toBe(false);
		});

		it("returns true for VS Code agent plugin paths on Unix", () => {
			expect(isVsCodeCopilotRoot("/home/user/.vscode/agent-plugins/wf")).toBe(
				true,
			);
		});

		it("returns true for VS Code agent plugin paths on Windows", () => {
			expect(
				isVsCodeCopilotRoot("C:\\Users\\user\\.vscode\\agent-plugins\\wf"),
			).toBe(true);
		});

		it("returns false for standard Claude plugin paths", () => {
			expect(isVsCodeCopilotRoot("/home/user/.claude/plugins/cache/wf")).toBe(
				false,
			);
		});
	});

	describe("Harness Detection Matrix", () => {
		it("detects Copilot when COPILOT_PLUGIN_DATA is set", () => {
			const harness = detectHarness(
				{},
				{ COPILOT_PLUGIN_DATA: "/tmp/copilot" },
			);
			expect(harness).toBe("copilot");
		});

		it("detects Copilot when CLAUDE_PLUGIN_ROOT is under .vscode/agent-plugins", () => {
			const harness = detectHarness(
				{},
				{ CLAUDE_PLUGIN_ROOT: "/Users/user/.vscode/agent-plugins/wf" },
			);
			expect(harness).toBe("copilot");
		});

		it("detects Codex when PLUGIN_DATA is set", () => {
			const harness = detectHarness({}, { PLUGIN_DATA: "/tmp/codex" });
			expect(harness).toBe("codex");
		});

		it("detects Codex when CODEX_SESSION_ID is set", () => {
			const harness = detectHarness({}, { CODEX_SESSION_ID: "session-123" });
			expect(harness).toBe("codex");
		});

		it("detects Codex when CODEX_THREAD_ID is set", () => {
			const harness = detectHarness({}, { CODEX_THREAD_ID: "thread-123" });
			expect(harness).toBe("codex");
		});

		it("detects Codex from hookEventName in payload", () => {
			const harness = detectHarness({ hookEventName: "UserPromptSubmit" }, {});
			expect(harness).toBe("codex");
		});

		it("detects AGY when AGY_HOOK_ACTIVE is set", () => {
			const harness = detectHarness({}, { AGY_HOOK_ACTIVE: "1" });
			expect(harness).toBe("agy");
		});

		it("detects AGY from AGY payload envelope with conversationId and transcriptPath", () => {
			const harness = detectHarness(
				{
					conversationId: "conv-123",
					transcriptPath: "/path/to/transcript.jsonl",
				},
				{},
			);
			expect(harness).toBe("agy");
		});

		it("detects AGY from AGY payload with stepIdx or toolCall", () => {
			const harness = detectHarness(
				{
					conversationId: "conv-123",
					stepIdx: 5,
					toolCall: { name: "run_command" },
				},
				{},
			);
			expect(harness).toBe("agy");
		});

		it("detects Claude Code from CLAUDE_PLUGIN_ROOT", () => {
			const harness = detectHarness(
				{},
				{ CLAUDE_PLUGIN_ROOT: "/home/user/.claude/plugins/wf" },
			);
			expect(harness).toBe("claude");
		});

		it("detects Claude Code from Claude Code snake_case payload", () => {
			const harness = detectHarness(
				{
					hook_event_name: "PreToolUse",
					session_id: "claude-session-123",
					tool_name: "Bash",
				},
				{},
			);
			expect(harness).toBe("claude");
		});

		it("returns null when no indicators exist", () => {
			const harness = detectHarness({}, {});
			expect(harness).toBeNull();
		});
	});

	describe("resolveConversationIdFromHarnesses", () => {
		it("resolves conversation ID for Antigravity", () => {
			expect(
				resolveConversationIdFromHarnesses({
					ANTIGRAVITY_CONVERSATION_ID: "agy-uuid-1",
				}),
			).toBe("agy-uuid-1");
			expect(
				resolveConversationIdFromHarnesses({
					AGY_CONVERSATION_ID: "agy-uuid-2",
				}),
			).toBe("agy-uuid-2");
		});

		it("resolves conversation ID for Claude Code", () => {
			expect(
				resolveConversationIdFromHarnesses({
					CLAUDE_CONVERSATION_ID: "claude-uuid-1",
				}),
			).toBe("claude-uuid-1");
			expect(
				resolveConversationIdFromHarnesses({
					CLAUDE_SESSION_ID: "claude-uuid-2",
				}),
			).toBe("claude-uuid-2");
		});

		it("resolves conversation ID for Codex", () => {
			expect(
				resolveConversationIdFromHarnesses({
					CODEX_CONVERSATION_ID: "codex-uuid-1",
				}),
			).toBe("codex-uuid-1");
			expect(
				resolveConversationIdFromHarnesses({
					CODEX_SESSION_ID: "codex-uuid-2",
				}),
			).toBe("codex-uuid-2");
		});

		it("resolves conversation ID for Copilot", () => {
			expect(
				resolveConversationIdFromHarnesses({
					COPILOT_CONVERSATION_ID: "copilot-uuid-1",
				}),
			).toBe("copilot-uuid-1");
			expect(
				resolveConversationIdFromHarnesses({
					VSCODE_COPILOT_SESSION_ID: "copilot-uuid-2",
				}),
			).toBe("copilot-uuid-2");
		});

		it("returns null when no harness environment variables are set", () => {
			expect(resolveConversationIdFromHarnesses({})).toBeNull();
		});
	});

	describe("resolveStorageDirFromHarnesses", () => {
		it("resolves storage directory for Codex from PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					PLUGIN_DATA: "/path/to/codex/data",
				}),
			).toBe("/path/to/codex/data");
		});

		it("resolves storage directory for Claude Code from CLAUDE_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					CLAUDE_PLUGIN_DATA: "/path/to/claude/data",
				}),
			).toBe("/path/to/claude/data");
		});

		it("resolves storage directory for Copilot from COPILOT_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					COPILOT_PLUGIN_DATA: "/path/to/copilot/data",
				}),
			).toBe("/path/to/copilot/data");
		});

		it("resolves storage directory for Antigravity from AGY_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					AGY_PLUGIN_DATA: "/path/to/agy/data",
				}),
			).toBe("/path/to/agy/data");
		});

		it("returns null when no harness storage variables are set", () => {
			expect(resolveStorageDirFromHarnesses({})).toBeNull();
		});
	});
});
