import { describe, expect, it } from "vitest";
import { detectHarness, isVsCodeCopilotRoot } from "./detect.ts";

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
});
