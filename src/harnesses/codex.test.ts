import { describe, expect, it } from "vitest";
import { codexHarness } from "./codex.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "codex",
		conversationId: "test-codex-conv",
		workspacePath: "/test/project",
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
}

describe("codexHarness", () => {
	describe("detect", () => {
		it("detects hookEventName in payload", () => {
			expect(codexHarness.detect({ hookEventName: "Stop" }, {})).toBe(true);
			expect(
				codexHarness.detect({ hookEventName: "UserPromptSubmit" }, {}),
			).toBe(true);
		});

		it("detects CODEX_SESSION_ID in environment", () => {
			expect(codexHarness.detect({}, { CODEX_SESSION_ID: "session-123" })).toBe(
				true,
			);
		});

		it("returns false without hookEventName or CODEX_SESSION_ID", () => {
			expect(codexHarness.detect({}, {})).toBe(false);
			expect(codexHarness.detect({}, { UNRELATED: "true" })).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes user prompt submit event", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "/wf next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "codex-s1",
				  "harness": "codex",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/wf next",
				    "stepIndex": 0,
				    "type": "USER_INPUT",
				  },
				  "prompt": "/wf next",
				  "rawPayload": {
				    "cwd": "/codex/workspace",
				    "hook_event_name": "UserPromptSubmit",
				    "prompt": "/wf next",
				    "session_id": "codex-s1",
				  },
				  "stopHookActive": false,
				  "toolCall": undefined,
				  "type": "pre",
				  "workspacePath": "/codex/workspace",
				}
			`);
		});

		it("normalizes stop hook event with assistant message", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "Stop",
				last_assistant_message: "Done with task",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "codex-s1",
				  "harness": "codex",
				  "isInterrupted": false,
				  "isStop": true,
				  "latestMessage": {
				    "content": "Done with task",
				    "stepIndex": 0,
				    "type": "PLANNER_RESPONSE",
				  },
				  "prompt": undefined,
				  "rawPayload": {
				    "cwd": "/codex/workspace",
				    "hook_event_name": "Stop",
				    "last_assistant_message": "Done with task",
				    "session_id": "codex-s1",
				  },
				  "stopHookActive": false,
				  "toolCall": undefined,
				  "type": "stop",
				  "workspacePath": "/codex/workspace",
				}
			`);
		});

		it("normalizes tool call event", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "PreToolUse",
				tool_name: "apply_patch",
				tool_input: { patch: "***" },
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "codex-s1",
				  "harness": "codex",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": null,
				  "prompt": undefined,
				  "rawPayload": {
				    "cwd": "/codex/workspace",
				    "hook_event_name": "PreToolUse",
				    "session_id": "codex-s1",
				    "tool_input": {
				      "patch": "***",
				    },
				    "tool_name": "apply_patch",
				  },
				  "stopHookActive": false,
				  "toolCall": {
				    "args": {
				      "patch": "***",
				    },
				    "name": "apply_patch",
				  },
				  "type": "tool",
				  "workspacePath": "/codex/workspace",
				}
			`);
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts last_assistant_message on stop", () => {
			const event = createMockEvent({
				type: "stop",
				isStop: true,
				rawPayload: { last_assistant_message: "Assistant response" },
			});
			const res = codexHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "PLANNER_RESPONSE",
				content: "Assistant response",
			});
		});

		it("extracts user prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "User question",
			});
			const res = codexHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "USER_INPUT",
				content: "User question",
			});
		});

		it("returns null when neither is present", () => {
			const event = createMockEvent({ type: "pre", prompt: undefined });
			expect(codexHarness.extractLatestMessage(event)).toBeNull();
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as block", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = codexHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "block",
				  "reason": "Execute step 2",
				  "suppressOutput": true,
				}
			`);
		});

		it("continues execution even when stopHookActive is true", () => {
			const event = createMockEvent({
				type: "stop",
				isStop: true,
				stopHookActive: true,
			});
			const egress = codexHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "block",
				reason: "Execute step 2",
				suppressOutput: true,
			});
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = codexHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats UserPromptSubmit injection with hookSpecificOutput", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = codexHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "additionalContext": "Instruction for step 1",
				    "hookEventName": "UserPromptSubmit",
				  },
				  "suppressOutput": true,
				  "systemMessage": "[WORKFLOW]",
				}
			`);
		});

		it("formats PreToolUse deny decision with fallback reason", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = codexHarness.formatEgress(event, {
				decision: "deny",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: "Action blocked by workflow policy.",
				},
			});
		});
	});
});
