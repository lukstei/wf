import type { HookResponse } from "../types.ts";
import type { HarnessType } from "./detect.ts";
import type { NormalizedEvent } from "./normalizer.ts";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

export function formatEgress(
	harness: HarnessType,
	event: NormalizedEvent,
	response: HookResponse,
): EgressOutput {
	// 1. Handle STOP Lifecycle Events
	if (event.type === "stop") {
		if (response.decision === "continue" && response.reason) {
			// Anti-recursion guard for Claude Code Stop hooks:
			// If Claude Code already looped on stop_hook_active, yield to prevent runaway loop
			if (event.stopHookActive) {
				return { exitCode: 0, stdout: "{}" };
			}

			switch (harness) {
				case "claude":
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							decision: "block",
							reason: response.reason,
						}),
					};

				case "codex":
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							hookSpecificOutput: {
								hookEventName: "Stop",
								additionalContext: response.reason,
							},
						}),
					};
				default:
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							decision: "continue",
							reason: response.reason,
						}),
					};
			}
		}

		// Default Stop allow
		if (harness === "agy") {
			return { exitCode: 0, stdout: JSON.stringify({ decision: "allow" }) };
		}
		return { exitCode: 0, stdout: "{}" };
	}

	// 2. Handle PRE / Prompt Lifecycle Events
	if (event.type === "pre") {
		const ephemeralMessage =
			response.injectSteps?.[0]?.ephemeralMessage || response.message || "";

		if (!ephemeralMessage) {
			return { exitCode: 0, stdout: "{}" };
		}

		switch (harness) {
			case "claude":
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						hookSpecificOutput: {
							hookEventName: "UserPromptSubmit",
							additionalContext: ephemeralMessage,
						},
					}),
				};

			case "codex":
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						systemMessage: "[WORKFLOW]",
						hookSpecificOutput: {
							hookEventName: "UserPromptSubmit",
							additionalContext: ephemeralMessage,
						},
					}),
				};

			case "copilot":
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						additionalContext: ephemeralMessage,
					}),
				};
			default:
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						injectSteps: [{ ephemeralMessage }],
					}),
				};
		}
	}

	// 3. Handle TOOL Lifecycle Events
	if (event.type === "tool") {
		const isDeny = response.decision === "deny";
		const reason = response.reason || "Action blocked by workflow policy.";

		switch (harness) {
			case "claude":
				if (isDeny) {
					return { exitCode: 2, stderr: reason };
				}
				return { exitCode: 0 };

			case "codex":
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						hookSpecificOutput: {
							hookEventName: "PreToolUse",
							permissionDecision: isDeny ? "deny" : "allow",
							permissionDecisionReason: isDeny ? reason : undefined,
						},
					}),
				};
			default:
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: isDeny ? "deny" : "allow",
						...(isDeny ? { reason } : {}),
						...(response.overwrite ? { overwrite: response.overwrite } : {}),
					}),
				};
		}
	}

	return { exitCode: 0, stdout: JSON.stringify(response) };
}

export function emitEgress(output: EgressOutput): void {
	if (output.stdout) {
		process.stdout.write(output.stdout);
	}
	if (output.stderr) {
		process.stderr.write(output.stderr);
	}
	process.exit(output.exitCode);
}
