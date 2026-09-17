import { runCli } from "./src/cli.ts";

export async function main() {
	await runCli();
}

try {
	main();
} catch (_err) {
	// Silent fail safe
}
