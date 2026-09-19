import { describe, expect, it } from "vitest";
import { claudeHarness } from "./claude.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "claude",
		conversationId: "test-claude-conv",
		workspacePath: "/test/project",
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
}

describe("claudeHarness", () => {
	describe("detect", () => {
		it("detects hook_event_name in payload", () => {
			expect(claudeHarness.detect({ hook_event_name: "Stop" }, {})).toBe(true);
			expect(claudeHarness.detect({ hook_event_name: "PreToolUse" }, {})).toBe(
				true,
			);
		});

		it("detects CLAUDE_CODE_SESSION_ID in environment", () => {
			expect(
				claudeHarness.detect({}, { CLAUDE_CODE_SESSION_ID: "session-123" }),
			).toBe(true);
		});

		it("returns false without hook_event_name or CLAUDE_CODE_SESSION_ID", () => {
			expect(claudeHarness.detect({}, {})).toBe(false);
			expect(claudeHarness.detect({ session_id: "s1" }, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes user prompt submit event", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "/wf run deploy.md",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "claude-s1",
				  "harness": "claude",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/wf run deploy.md",
				    "stepIndex": 0,
				    "type": "USER_INPUT",
				  },
				  "prompt": "/wf run deploy.md",
				  "rawPayload": {
				    "cwd": "/claude/workspace",
				    "hook_event_name": "UserPromptSubmit",
				    "prompt": "/wf run deploy.md",
				    "session_id": "claude-s1",
				  },
				  "stopHookActive": false,
				  "toolCall": undefined,
				  "type": "pre",
				  "workspacePath": "/claude/workspace",
				}
			`);
		});

		it("normalizes stop hook event with stop_hook_active", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "Stop",
				stop_hook_active: true,
				last_assistant_message: "Completed task",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "claude-s1",
				  "harness": "claude",
				  "isInterrupted": false,
				  "isStop": true,
				  "latestMessage": {
				    "content": "Completed task",
				    "stepIndex": 0,
				    "type": "PLANNER_RESPONSE",
				  },
				  "prompt": undefined,
				  "rawPayload": {
				    "cwd": "/claude/workspace",
				    "hook_event_name": "Stop",
				    "last_assistant_message": "Completed task",
				    "session_id": "claude-s1",
				    "stop_hook_active": true,
				  },
				  "stopHookActive": true,
				  "toolCall": undefined,
				  "type": "stop",
				  "workspacePath": "/claude/workspace",
				}
			`);
		});

		it("normalizes tool use event", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "PreToolUse",
				tool_name: "Bash",
				tool_input: { command: "npm test" },
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "claude-s1",
				  "harness": "claude",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": null,
				  "prompt": undefined,
				  "rawPayload": {
				    "cwd": "/claude/workspace",
				    "hook_event_name": "PreToolUse",
				    "session_id": "claude-s1",
				    "tool_input": {
				      "command": "npm test",
				    },
				    "tool_name": "Bash",
				  },
				  "stopHookActive": false,
				  "toolCall": {
				    "args": {
				      "command": "npm test",
				    },
				    "name": "Bash",
				  },
				  "type": "tool",
				  "workspacePath": "/claude/workspace",
				}
			`);
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts last_assistant_message on stop", () => {
			const event = createMockEvent({
				type: "stop",
				isStop: true,
				rawPayload: { last_assistant_message: "Claude answer" },
			});
			const res = claudeHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "PLANNER_RESPONSE",
				content: "Claude answer",
			});
		});

		it("extracts user prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/wf next",
			});
			const res = claudeHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "USER_INPUT",
				content: "/wf next",
			});
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as block", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = claudeHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "block",
				  "reason": "Execute step 2",
				}
			`);
		});

		it("continues execution even when stopHookActive is true", () => {
			const event = createMockEvent({
				type: "stop",
				isStop: true,
				stopHookActive: true,
			});
			const egress = claudeHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "block",
				reason: "Execute step 2",
			});
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = claudeHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats UserPromptSubmit injection with hookSpecificOutput", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = claudeHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "additionalContext": "Instruction for step 1",
				    "hookEventName": "UserPromptSubmit",
				  },
				}
			`);
		});

		it("blocks tool with exit code 2 and stderr", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = claudeHarness.formatEgress(event, {
				decision: "deny",
				reason: "Blocked action",
			});
			expect(egress.exitCode).toBe(2);
			expect(egress.stderr).toBe("Blocked action");
		});

		it("allows tool with exit code 0", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = claudeHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
		});
	});
});
