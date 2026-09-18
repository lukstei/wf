import { describe, expect, it } from "vitest";
import { saveState } from "../state.ts";
import { runShim } from "./runtime-shim.ts";

describe("runShim End-to-End Simulation", () => {
	it("processes AGY pre-invocation hook when idle", async () => {
		const rawInput = JSON.stringify({
			conversationId: "test-agy-idle",
			workspacePaths: ["/test"],
		});

		const egress = await runShim("pre", rawInput, { AGY_HOOK_ACTIVE: "1" });
		expect(egress.exitCode).toBe(0);
		expect(egress.stdout).toBe("{}");
	});

	it("processes AGY stop hook when idle", async () => {
		const rawInput = JSON.stringify({
			conversationId: "test-agy-stop",
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});

		const egress = await runShim("stop", rawInput, { AGY_HOOK_ACTIVE: "1" });
		expect(egress.exitCode).toBe(0);
		expect(JSON.parse(egress.stdout ?? "{}")).toEqual({ decision: "allow" });
	});

	it("processes Claude Code user prompt submission for /wf-help", async () => {
		const rawInput = JSON.stringify({
			hook_event_name: "UserPromptSubmit",
			session_id: "claude-session-1",
			cwd: "/test",
			prompt: "/wf-help",
		});

		const egress = await runShim("pre", rawInput, {
			CLAUDE_PLUGIN_ROOT: "/plugin",
		});

		expect(egress.exitCode).toBe(0);
		const parsed = JSON.parse(egress.stdout ?? "{}");
		expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"Workflow Runner",
		);
	});

	it("processes Codex stop hook when idle", async () => {
		const rawInput = JSON.stringify({
			hookEventName: "Stop",
			session_id: "codex-session-1",
			cwd: "/test",
		});

		const egress = await runShim("stop", rawInput, {
			PLUGIN_DATA: "/tmp/codex-data",
		});

		expect(egress.exitCode).toBe(0);
		expect(egress.stdout).toBe("{}");
	});

	it("does nothing when harness cannot be detected", async () => {
		const egress = await runShim("pre", "{}", {});
		expect(egress.exitCode).toBe(0);
		expect(egress.stdout).toBeUndefined();
	});

	it("advances active workflow in Codex stop hook with block decision", async () => {
		const sessionId = "codex-active-wf-1";
		const env = { PLUGIN_DATA: "/tmp/codex-data" };
		saveState(
			sessionId,
			{
				status: "active",
				workflow: {
					name: "Sample Workflow",
					filePath: "sample.md",
					flatSteps: [
						{
							index: 0,
							level: 1,
							type: "step",
							instruction: "Step 1 instruction",
							nextIndex: 1,
						},
						{
							index: 1,
							level: 1,
							type: "step",
							instruction: "Step 2 instruction",
							nextIndex: 2,
						},
					],
				},
				step: 0,
				iterationCount: 0,
			},
			env,
		);

		const rawInput = JSON.stringify({
			hook_event_name: "Stop",
			session_id: sessionId,
			cwd: "/test",
			stop_hook_active: false,
			last_assistant_message: "Finished step 1",
		});

		const egress = await runShim("stop", rawInput, env);

		expect(egress.exitCode).toBe(0);

		expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
			{
			  "decision": "block",
			  "reason": "[wf] Executing next step: Step 2 (Level 1)

			INSTRUCTION:
			Step 2 instruction

			Continue immediately and execute this step.",
			  "suppressOutput": true,
			}
		`);
	});
});
