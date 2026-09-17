import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	normalizePayload,
	parseJsonSafe,
	readStdin,
	stripBom,
} from "./normalizer.ts";

describe("normalizer", () => {
	describe("stripBom", () => {
		it("strips UTF-8 BOM from start of text", () => {
			expect(stripBom("\uFEFFhello")).toBe("hello");
			expect(stripBom("hello")).toBe("hello");
		});
	});

	describe("parseJsonSafe", () => {
		it("parses valid JSON with BOM", () => {
			expect(parseJsonSafe('\uFEFF{"hello":"world"}')).toEqual({
				hello: "world",
			});
		});

		it("returns empty object on empty or invalid input without throwing", () => {
			expect(parseJsonSafe("")).toEqual({});
			expect(parseJsonSafe("not valid json")).toEqual({});
			expect(parseJsonSafe("   ")).toEqual({});
		});
	});

	describe("readStdin", () => {
		it("reads stream content and resolves on end", async () => {
			const stream = Readable.from(['\uFEFF{"test":', "123}"]);
			const result = await readStdin(1000, stream);
			expect(result).toBe('{"test":123}');
		});

		it("triggers timeout fallback if end event is delayed/swallowed", async () => {
			let pushed = false;
			const stream = new Readable({
				read() {
					if (!pushed) {
						pushed = true;
						this.push('{"hung":true}');
					}
				},
			});

			const result = await readStdin(50, stream);
			expect(result).toBe('{"hung":true}');
		});
	});

	describe("normalizePayload", () => {
		it("normalizes AGY pre-invocation payload", () => {
			const event = normalizePayload(
				{
					conversationId: "conv-1",
					workspacePaths: ["/path/to/project"],
					invocationNum: 2,
				},
				"pre",
				{ AGY_HOOK_ACTIVE: "1" },
			);

			expect(event.type).toBe("pre");
			expect(event.harness).toBe("agy");
			expect(event.conversationId).toBe("conv-1");
			expect(event.workspacePath).toBe("/path/to/project");
			expect(event.isStop).toBe(false);
		});

		it("normalizes AGY stop payload", () => {
			const event = normalizePayload(
				{
					conversationId: "conv-1",
					workspacePaths: ["/path/to/project"],
					terminationReason: "model_stop",
				},
				"stop",
				{ AGY_HOOK_ACTIVE: "1" },
			);

			expect(event.type).toBe("stop");
			expect(event.harness).toBe("agy");
			expect(event.isStop).toBe(true);
			expect(event.isInterrupted).toBe(false);
		});

		it("detects user interruption in stop reason", () => {
			const event = normalizePayload(
				{
					conversationId: "conv-1",
					terminationReason: "user_cancelled",
				},
				"stop",
			);

			expect(event.isInterrupted).toBe(true);
		});

		it("normalizes Claude Code prompt payload", () => {
			const event = normalizePayload(
				{
					hook_event_name: "UserPromptSubmit",
					session_id: "session-claude",
					cwd: "/claude/project",
					prompt: "/wf run deploy.md",
				},
				undefined,
				{ CLAUDE_PLUGIN_ROOT: "/plugin" },
			);

			expect(event.type).toBe("pre");
			expect(event.harness).toBe("claude");
			expect(event.conversationId).toBe("session-claude");
			expect(event.workspacePath).toBe("/claude/project");
			expect(event.prompt).toBe("/wf run deploy.md");
		});

		it("normalizes tool call from Claude Code and AGY", () => {
			// Claude format
			const claudeEvent = normalizePayload(
				{
					hook_event_name: "PreToolUse",
					session_id: "s1",
					tool_name: "Bash",
					tool_input: { command: "npm test" },
				},
				"tool",
			);

			expect(claudeEvent.type).toBe("tool");
			expect(claudeEvent.toolCall).toEqual({
				name: "Bash",
				args: { command: "npm test" },
			});

			// AGY format
			const agyEvent = normalizePayload(
				{
					conversationId: "c1",
					toolCall: {
						name: "run_command",
						args: { CommandLine: "npm test" },
					},
				},
				"tool",
			);

			expect(agyEvent.type).toBe("tool");
			expect(agyEvent.toolCall).toEqual({
				name: "run_command",
				args: { CommandLine: "npm test" },
			});
		});

		it("normalizes Claude Code stop hook with stop_hook_active", () => {
			const event = normalizePayload(
				{
					hook_event_name: "Stop",
					session_id: "s2",
					stop_hook_active: true,
				},
				undefined,
				{ CLAUDE_PLUGIN_ROOT: "/plugin" },
			);

			expect(event.type).toBe("stop");
			expect(event.isStop).toBe(true);
			expect(event.stopHookActive).toBe(true);
		});
	});
});
