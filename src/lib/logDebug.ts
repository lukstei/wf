import * as fs from "node:fs";

export function logDebug(message: string, data?: unknown) {
	if (process.env.VITEST && !process.env.WF_DEBUG) {
		return;
	}
	const line = `[${(logDebug.conversationId ?? "unknown").split("-")[0]}] ${message} ${
		data !== undefined ? JSON.stringify(data, null, 2) : ""
	}\n`;
	try {
		fs.appendFileSync("/tmp/wf-debug.log", line);
	} catch {
		// Ignore logging errors
	}
}
logDebug.conversationId = undefined as string | undefined;
