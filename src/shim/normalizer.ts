import { detectHarness, type HarnessType } from "./detect.ts";

export interface NormalizedEvent {
	type: "pre" | "stop" | "tool";
	harness: HarnessType;
	conversationId: string;
	workspacePath: string;
	prompt?: string;
	toolCall?: {
		name: string;
		args: Record<string, unknown>;
	};
	isStop: boolean;
	stopHookActive: boolean;
	terminationReason?: string;
	isInterrupted: boolean;
	rawPayload: Record<string, unknown>;
}

export function stripBom(text: string): string {
	return text.replace(/^\uFEFF/, "");
}

export function parseJsonSafe(raw: string): Record<string, unknown> {
	const clean = stripBom(raw).trim();
	if (!clean) return {};
	try {
		return JSON.parse(clean);
	} catch {
		return {};
	}
}

export function readStdin(
	timeoutMs = 1000,
	stream: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
	return new Promise((resolve) => {
		let buffer = "";
		let settled = false;

		function onData(chunk: Buffer | string) {
			if (settled) return;
			buffer += chunk.toString();
		}

		function done() {
			if (settled) return;
			settled = true;
			stream.removeListener("data", onData);
			stream.removeListener("end", done);
			stream.removeListener("error", done);
			clearTimeout(timer);
			resolve(stripBom(buffer));
		}

		stream.on("data", onData);
		stream.on("end", done);
		stream.on("error", done);

		const timer = setTimeout(done, timeoutMs);
		if (typeof timer.unref === "function") {
			timer.unref();
		}
	});
}

export function normalizePayload(
	payload: Record<string, unknown>,
	modeArg?: string,
	env: NodeJS.ProcessEnv = process.env,
): NormalizedEvent {
	const harness = detectHarness(payload, env);

	const conversationId = String(
		payload.conversationId ||
			payload.session_id ||
			payload.sessionId ||
			"default",
	);

	const workspacePaths = Array.isArray(payload.workspacePaths)
		? (payload.workspacePaths as unknown[])
		: undefined;
	const workspacePath = String(
		workspacePaths?.[0] || payload.cwd || env.PWD || ".",
	);

	const eventName = payload.hook_event_name || payload.hookEventName;

	const isStop =
		modeArg === "stop" ||
		eventName === "Stop" ||
		payload.stop_hook_active !== undefined ||
		Boolean(payload.terminationReason && !payload.invocationNum);

	const isTool =
		modeArg === "tool" ||
		eventName === "PreToolUse" ||
		payload.toolCall !== undefined ||
		payload.tool_name !== undefined;

	const type: "pre" | "stop" | "tool" = isStop
		? "stop"
		: isTool
			? "tool"
			: "pre";

	let toolCall: { name: string; args: Record<string, unknown> } | undefined;
	if (isTool) {
		const rawToolCall = payload.toolCall as
			| { name?: string; args?: Record<string, unknown> }
			| undefined;
		toolCall = {
			name: String(rawToolCall?.name || payload.tool_name || "unknown"),
			args:
				rawToolCall?.args ||
				(payload.tool_input as Record<string, unknown> | undefined) ||
				{},
		};
	}

	const prompt = (payload.prompt || payload.userPrompt) as string | undefined;
	const terminationReason = (payload.terminationReason ||
		payload.stop_reason) as string | undefined;
	const isInterrupted = Boolean(
		terminationReason && /cancel|abort|interrupt/i.test(terminationReason),
	);
	const stopHookActive = Boolean(payload.stop_hook_active);

	return {
		type,
		harness,
		conversationId,
		workspacePath,
		prompt,
		toolCall,
		isStop,
		stopHookActive,
		terminationReason,
		isInterrupted,
		rawPayload: payload,
	};
}
