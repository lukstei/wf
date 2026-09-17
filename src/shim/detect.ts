export type HarnessType = "claude" | "codex" | "agy" | "copilot" | "unknown";

export function isVsCodeCopilotRoot(pluginRoot?: string): boolean {
	if (!pluginRoot) return false;
	const segments = pluginRoot.split(/[\\/]+/);
	return (
		segments.includes("agent-plugins") &&
		pluginRoot.toLowerCase().includes(".vscode")
	);
}

export function detectHarness(
	payload: Record<string, unknown> = {},
	env: NodeJS.ProcessEnv = process.env,
): HarnessType {
	// 1. Explicit Copilot markers
	if (env.COPILOT_PLUGIN_DATA || isVsCodeCopilotRoot(env.CLAUDE_PLUGIN_ROOT)) {
		return "copilot";
	}

	// 2. OpenAI Codex markers
	if (
		env.PLUGIN_DATA ||
		env.CODEX_SESSION_ID ||
		env.CODEX_THREAD_ID ||
		payload.hookEventName !== undefined
	) {
		return "codex";
	}

	// 3. Antigravity / Gemini markers (explicit env or AGY-specific payload signatures)
	if (env.AGY_HOOK_ACTIVE || env.GEMINI_CLI) {
		return "agy";
	}
	if (
		payload.conversationId !== undefined &&
		(payload.stepIdx !== undefined ||
			payload.transcriptPath !== undefined ||
			payload.invocationNum !== undefined ||
			payload.artifactDirectoryPath !== undefined ||
			payload.toolCall !== undefined)
	) {
		return "agy";
	}

	// 4. Anthropic Claude Code markers
	if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDE_PROJECT_DIR) {
		return "claude";
	}
	if (
		payload.hook_event_name !== undefined ||
		payload.tool_name !== undefined ||
		payload.stop_hook_active !== undefined ||
		payload.session_id !== undefined
	) {
		return "claude";
	}

	// 5. Default AGY fallback when conversationId is present without Claude/Codex markers
	if (payload.conversationId && !payload.session_id) {
		return "agy";
	}

	return "unknown";
}
