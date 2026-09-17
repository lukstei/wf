import { describe, expect, it } from "vitest";
import { formatEgress } from "./egress.ts";
import type { NormalizedEvent } from "./normalizer.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "agy",
		conversationId: "test-conv",
		workspacePath: "/test/project",
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		rawPayload: {},
		...overrides,
	};
}

describe("formatEgress", () => {
	describe("Stop Lifecycle Events", () => {
		it("formats AGY continue decision", () => {
			const event = createMockEvent({
				type: "stop",
				harness: "agy",
				isStop: true,
			});
			const egress = formatEgress("agy", event, {
				decision: "continue",
				reason: "Execute step 2",
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "continue",
				reason: "Execute step 2",
			});
		});

		it("formats Claude Code continue decision (decision: block)", () => {
			const event = createMockEvent({
				type: "stop",
				harness: "claude",
				isStop: true,
			});
			const egress = formatEgress("claude", event, {
				decision: "continue",
				reason: "Execute step 2",
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "block",
				reason: "Execute step 2",
			});
		});

		it("triggers anti-recursion safeguard when stopHookActive is true in Claude Code", () => {
			const event = createMockEvent({
				type: "stop",
				harness: "claude",
				isStop: true,
				stopHookActive: true,
			});
			const egress = formatEgress("claude", event, {
				decision: "continue",
				reason: "Execute step 2",
			});

			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats Codex continue decision", () => {
			const event = createMockEvent({
				type: "stop",
				harness: "codex",
				isStop: true,
			});
			const egress = formatEgress("codex", event, {
				decision: "continue",
				reason: "Execute step 2",
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				hookSpecificOutput: {
					hookEventName: "Stop",
					additionalContext: "Execute step 2",
				},
			});
		});

		it("formats Stop allow decisions", () => {
			const agyEvent = createMockEvent({
				type: "stop",
				harness: "agy",
				isStop: true,
			});
			const agyEgress = formatEgress("agy", agyEvent, { decision: "allow" });
			expect(JSON.parse(agyEgress.stdout ?? "{}")).toEqual({
				decision: "allow",
			});

			const claudeEvent = createMockEvent({
				type: "stop",
				harness: "claude",
				isStop: true,
			});
			const claudeEgress = formatEgress("claude", claudeEvent, {
				decision: "allow",
			});
			expect(claudeEgress.stdout).toBe("{}");
		});
	});

	describe("Pre / Prompt Lifecycle Events", () => {
		it("formats AGY ephemeral step injection", () => {
			const event = createMockEvent({ type: "pre", harness: "agy" });
			const egress = formatEgress("agy", event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
		});

		it("formats Claude Code UserPromptSubmit injection", () => {
			const event = createMockEvent({ type: "pre", harness: "claude" });
			const egress = formatEgress("claude", event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				hookSpecificOutput: {
					hookEventName: "UserPromptSubmit",
					additionalContext: "Instruction for step 1",
				},
			});
		});

		it("formats Codex UserPromptSubmit injection", () => {
			const event = createMockEvent({ type: "pre", harness: "codex" });
			const egress = formatEgress("codex", event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				systemMessage: "[WORKFLOW]",
				hookSpecificOutput: {
					hookEventName: "UserPromptSubmit",
					additionalContext: "Instruction for step 1",
				},
			});
		});

		it("formats Copilot additionalContext injection", () => {
			const event = createMockEvent({ type: "pre", harness: "copilot" });
			const egress = formatEgress("copilot", event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				additionalContext: "Instruction for step 1",
			});
		});

		it("returns empty object when no message is injected", () => {
			const event = createMockEvent({ type: "pre", harness: "claude" });
			const egress = formatEgress("claude", event, {});
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});
	});

	describe("Tool Lifecycle Events", () => {
		it("blocks tool execution with exit code 2 and stderr in Claude Code", () => {
			const event = createMockEvent({ type: "tool", harness: "claude" });
			const egress = formatEgress("claude", event, {
				decision: "deny",
				reason: "Cannot run dangerous commands",
			});

			expect(egress.exitCode).toBe(2);
			expect(egress.stderr).toBe("Cannot run dangerous commands");
		});

		it("blocks tool execution via JSON stdout in AGY", () => {
			const event = createMockEvent({ type: "tool", harness: "agy" });
			const egress = formatEgress("agy", event, {
				decision: "deny",
				reason: "Cannot run dangerous commands",
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "deny",
				reason: "Cannot run dangerous commands",
			});
		});

		it("blocks tool execution via hookSpecificOutput in Codex", () => {
			const event = createMockEvent({ type: "tool", harness: "codex" });
			const egress = formatEgress("codex", event, {
				decision: "deny",
				reason: "Cannot run dangerous commands",
			});

			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: "Cannot run dangerous commands",
				},
			});
		});
	});
});
