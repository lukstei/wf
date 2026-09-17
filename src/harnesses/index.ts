import { agyHarness } from "./agy.ts";
import { claudeHarness } from "./claude.ts";
import { codexHarness } from "./codex.ts";
import { copilotHarness } from "./copilot.ts";
import type { HarnessAdapter, HarnessType } from "./types.ts";

export * from "./types.ts";
export { agyHarness, claudeHarness, codexHarness, copilotHarness };

export const HARNESSES: readonly HarnessAdapter[] = [
	copilotHarness,
	codexHarness,
	claudeHarness,
	agyHarness,
];

export function detectHarness(
	payload: Record<string, unknown> = {},
	env: NodeJS.ProcessEnv = process.env,
): HarnessType | null {
	for (const harness of HARNESSES) {
		if (harness.detect(payload, env)) {
			return harness.id;
		}
	}

	return null;
}

export function getHarness(type: HarnessType): HarnessAdapter {
	switch (type) {
		case "codex":
			return codexHarness;
		case "claude":
			return claudeHarness;
		case "agy":
			return agyHarness;
		case "copilot":
			return copilotHarness;
	}
}
