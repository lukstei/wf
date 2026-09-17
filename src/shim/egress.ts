import { getHarness } from "../harnesses/index.ts";
import type {
	EgressOutput,
	HarnessType,
	NormalizedEvent,
} from "../harnesses/types.ts";
import type { HookResponse } from "../types.ts";

export type { EgressOutput, NormalizedEvent };

export function formatEgress(
	harness: HarnessType,
	event: NormalizedEvent,
	response: HookResponse,
): EgressOutput {
	return getHarness(harness).formatEgress(event, response);
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
