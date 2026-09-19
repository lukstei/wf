import { describe, expect, it } from "vitest";
import { agyHarness } from "./agy.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "agy",
		conversationId: "test-agy-conv",
		workspacePath: "/test/project",
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
}

describe("agyHarness", () => {
	describe("detect", () => {
		it("detects AGY_HOOK_ACTIVE", () => {
			expect(agyHarness.detect({}, { AGY_HOOK_ACTIVE: "1" })).toBe(true);
		});

		it("detects ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.detect({}, { ANTIGRAVITY_CONVERSATION_ID: "uuid-1" }),
			).toBe(true);
		});

		it("detects transcriptPath ending with .system_generated/logs/transcript.jsonl", () => {
			expect(
				agyHarness.detect(
					{
						transcriptPath:
							"/home/user/.gemini/antigravity/brain/uuid/.system_generated/logs/transcript.jsonl",
					},
					{},
				),
			).toBe(true);
		});

		it("returns false for non-matching payload", () => {
			expect(agyHarness.detect({ conversationId: "c1" }, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes pre-invocation event", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				prompt: "/wf next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "c-agy",
				  "harness": "agy",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/wf next",
				    "stepIndex": 0,
				    "type": "USER_INPUT",
				  },
				  "prompt": "/wf next",
				  "rawPayload": {
				    "conversationId": "c-agy",
				    "prompt": "/wf next",
				    "workspacePaths": [
				      "/agy/project",
				    ],
				  },
				  "stopHookActive": false,
				  "terminationReason": undefined,
				  "toolCall": undefined,
				  "type": "pre",
				  "workspacePath": "/agy/project",
				}
			`);
		});

		it("normalizes stop event", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				terminationReason: "model_stop",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "c-agy",
				  "harness": "agy",
				  "isInterrupted": false,
				  "isStop": true,
				  "latestMessage": null,
				  "prompt": undefined,
				  "rawPayload": {
				    "conversationId": "c-agy",
				    "terminationReason": "model_stop",
				    "workspacePaths": [
				      "/agy/project",
				    ],
				  },
				  "stopHookActive": false,
				  "terminationReason": "model_stop",
				  "toolCall": undefined,
				  "type": "stop",
				  "workspacePath": "/agy/project",
				}
			`);
		});

		it("detects user interruption in terminationReason", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				terminationReason: "user_cancelled",
			});
			expect(event.isInterrupted).toBe(true);
		});

		it("normalizes tool call", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				toolCall: {
					name: "run_command",
					args: { CommandLine: "ls" },
				},
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "c-agy",
				  "harness": "agy",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": null,
				  "prompt": undefined,
				  "rawPayload": {
				    "conversationId": "c-agy",
				    "toolCall": {
				      "args": {
				        "CommandLine": "ls",
				      },
				      "name": "run_command",
				    },
				    "workspacePaths": [
				      "/agy/project",
				    ],
				  },
				  "stopHookActive": false,
				  "terminationReason": undefined,
				  "toolCall": {
				    "args": {
				      "CommandLine": "ls",
				    },
				    "name": "run_command",
				  },
				  "type": "tool",
				  "workspacePath": "/agy/project",
				}
			`);
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts user prompt when present on first invocation", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/wf next",
				rawPayload: { invocationNum: 1 },
			});
			const res = agyHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "USER_INPUT",
				content: "/wf next",
			});
		});

		it("returns null on pre when invocationNum > 1 (prevent stale input re-injection)", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/wf next",
				rawPayload: { invocationNum: 2 },
			});
			expect(agyHarness.extractLatestMessage(event)).toBeNull();
		});

		it("extracts last_assistant_message on stop when transcript is absent", () => {
			const event = createMockEvent({
				type: "stop",
				rawPayload: { last_assistant_message: "AGY response" },
			});
			const res = agyHarness.extractLatestMessage(event);
			expect(res).toEqual({
				stepIndex: 0,
				type: "PLANNER_RESPONSE",
				content: "AGY response",
			});
		});

		it("returns null when no transcript, no assistant message, and no prompt", () => {
			const event = createMockEvent({ type: "stop" });
			expect(agyHarness.extractLatestMessage(event)).toBeNull();
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as continue", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = agyHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "continue",
				  "reason": "Execute step 2",
				}
			`);
		});

		it("formats Stop allow decision", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = agyHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "allow",
				}
			`);
		});

		it("formats PreInvocation injectSteps", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = agyHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "injectSteps": [
				    {
				      "ephemeralMessage": "Instruction for step 1",
				    },
				  ],
				}
			`);
		});

		it("formats Tool deny decision", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = agyHarness.formatEgress(event, {
				decision: "deny",
				reason: "Blocked action",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "deny",
				  "reason": "Blocked action",
				}
			`);
		});

		it("formats Tool allow with overwrite", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = agyHarness.formatEgress(event, {
				decision: "allow",
				overwrite: { sanitized: true },
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "allow",
				  "overwrite": {
				    "sanitized": true,
				  },
				}
			`);
		});
	});
});
