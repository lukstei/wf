import { parseArgs } from "node:util";
import { resolveConversationIdFromHarnesses } from "./harnesses/index.ts";
import { logDebug } from "./lib/logDebug.ts";
import { visualizeWorkflowPrompt } from "./lib/visualize.ts";
import { defaultWorkflowResolver } from "./resolver.ts";
import { runShim } from "./shim/runtime-shim.ts";
import { loadActiveWorkflow, saveState, saveWorkflow } from "./state.ts";
import {
	resumeWorkflow,
	startWorkflow,
	stopWorkflowState,
} from "./transitions.ts";
import { validateWorkflow } from "./validator.ts";
import { compileWorkflow } from "./workflow.ts";

export interface ParsedCli {
	command?: string;
	subcommand?: string;
	args: string[];
	options: {
		help?: boolean;
		version?: boolean;
		check?: boolean;
		[key: string]: unknown;
	};
}

export function getCliHelp(): string {
	return [
		"wf - Workflow Runner CLI",
		"",
		"Usage:",
		"  wf hook <event>       Execute harness lifecycle hook (pre, stop)",
		"  wf compile <file>     Compile workflow to JSON",
		"  wf start <file>       Start a workflow from a Markdown or JSON file",
		"  wf show [<file>]      Show workflow status, mermaid diagram, and current step",
		"  wf next               Execute the next step of a paused workflow",
		"  wf stop               Stop and reset the active workflow",
		"  wf help               Show this help reference",
		"",
		"Options:",
		"  --check               Validate workflow without outputting JSON",
		"  -h, --help            Show help",
		"  -v, --version         Show version",
	].join("\n");
}

export function parseCliArgs(
	args: string[] = process.argv.slice(2),
): ParsedCli {
	const { values, positionals } = parseArgs({
		args,
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
			check: { type: "boolean" },
		},
		allowPositionals: true,
		strict: false,
	});

	return {
		command: positionals[0],
		subcommand: positionals[1],
		args: positionals.slice(1),
		options: values as ParsedCli["options"],
	};
}

export interface CliIo {
	stdout?: (msg: string) => void;
	stderr?: (msg: string) => void;
	stdin?: string;
	env?: NodeJS.ProcessEnv;
}

export async function runCli(
	args: string[] = process.argv.slice(2),
	io: CliIo = {},
): Promise<{ exitCode: number; output?: string }> {
	const parsed = parseCliArgs(args);
	const env = io.env || process.env;
	const writeOut = io.stdout || ((msg: string) => console.log(msg));
	const writeErr = io.stderr || ((msg: string) => console.error(msg));

	if (parsed.options.help || parsed.command === "help") {
		const help = getCliHelp();
		writeOut(help);
		return { exitCode: 0, output: help };
	}

	if (parsed.options.version || parsed.command === "version") {
		const ver = "0.1.0";
		writeOut(ver);
		return { exitCode: 0, output: ver };
	}

	if (parsed.command === "hook") {
		const event = parsed.subcommand;
		if (!event || (event !== "pre" && event !== "stop")) {
			const err = `[wf error] Missing or unsupported hook event: "${event || ""}". Expected "pre" or "stop".`;
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const egress = await runShim(event, io.stdin, env);
		if (io.stdout) {
			if (egress.stdout) writeOut(egress.stdout);
			if (egress.stderr && io.stderr) io.stderr(egress.stderr);
		} else {
			if (egress.stdout) process.stdout.write(egress.stdout);
			if (egress.stderr) process.stderr.write(egress.stderr);
			process.exit(egress.exitCode);
		}
		return { exitCode: egress.exitCode, output: egress.stdout };
	}

	if (parsed.command === "compile") {
		const filePath = parsed.args[0];
		if (!filePath) {
			const err = "Missing required argument: <workflow-file>";
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const cwd = env.PWD || process.cwd();
		const resolved = defaultWorkflowResolver(filePath, [cwd]);
		if (!resolved || "error" in resolved) {
			const err = !resolved
				? `Workflow file not found: "${filePath}".`
				: resolved.error;
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const result = validateWorkflow(resolved.workflow);
		const errors = result.problems.filter((p) => p.type === "error");
		const warnings = result.problems.filter((p) => p.type === "warning");

		if (!result.valid) {
			const lines = [
				`[WORKFLOW INVALID] Validation failed for "${resolved.workflow.name}":`,
			];
			for (const e of errors) {
				lines.push(`  - [ERROR] ${e.description}`);
			}
			if (warnings.length > 0) {
				lines.push("\nWarnings:");
				for (const w of warnings) {
					lines.push(`  - [WARN] ${w.description}`);
				}
			}
			const out = lines.join("\n");
			writeErr(out);
			return { exitCode: 1, output: out };
		}

		if (parsed.options.check) {
			const lines = [
				`[WORKFLOW VALID] "${resolved.workflow.name}" is valid.`,
				`Steps: ${result.stats.totalSteps} (${result.stats.linearSteps} linear, ${result.stats.conditions} condition, ${result.stats.gates} gate)`,
				`File: ${resolved.filePath}`,
			];
			if (warnings.length > 0) {
				lines.push("\nWarnings:");
				for (const w of warnings) {
					lines.push(`  - [WARN] ${w.description}`);
				}
			}
			const out = lines.join("\n");
			writeOut(out);
			return { exitCode: 0, output: out };
		}

		if (warnings.length > 0) {
			for (const w of warnings) {
				writeErr(`[WARN] ${w.description}`);
			}
		}
		const compiledJson = JSON.stringify(resolved.workflow, null, 2);
		writeOut(compiledJson);
		return { exitCode: 0, output: compiledJson };
	}

	if (parsed.command === "show" && parsed.args[0]) {
		const filePath = parsed.args[0];
		const cwd = env.PWD || process.cwd();
		const resolved = defaultWorkflowResolver(filePath, [cwd]);
		if (!resolved || "error" in resolved) {
			const err = !resolved
				? `Workflow file not found: "${filePath}".`
				: resolved.error;
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const prompt = visualizeWorkflowPrompt(
			resolved.workflow.name,
			resolved.workflow,
			resolved.filePath,
		);
		writeOut(prompt);
		return { exitCode: 0, output: prompt };
	}

	const STATEFUL_COMMANDS = new Set(["stop", "start", "run", "next", "show"]);
	if (parsed.command && STATEFUL_COMMANDS.has(parsed.command)) {
		const conversationId = resolveConversationIdFromHarnesses(env);
		if (!conversationId) {
			const err =
				"[wf error] Unable to resolve active conversation ID from harness environment.";
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		logDebug.conversationId = conversationId;

		if (parsed.command === "stop") {
			const active = loadActiveWorkflow(conversationId, env);
			const result = stopWorkflowState(
				active?.state ?? null,
				active?.workflow.name,
			);
			if (result.state !== null) {
				saveState(conversationId, result.state, env);
			}
			const msg = result.wasRunning
				? `[WORKFLOW STOPPED] Workflow "${result.workflowName}" has been stopped.`
				: "[WORKFLOW STATUS] No workflow is currently running.";
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}

		if (parsed.command === "start" || parsed.command === "run") {
			const filePath = parsed.args[0];
			if (!filePath) {
				const err = "Missing required argument: <workflow-file>";
				writeErr(err);
				return { exitCode: 1, output: err };
			}
			const cwd = env.PWD || process.cwd();
			const resolved = defaultWorkflowResolver(filePath, [cwd]);
			if (!resolved || "error" in resolved) {
				const err = !resolved
					? `Workflow file not found: "${filePath}".`
					: resolved.error;
				writeErr(err);
				return { exitCode: 1, output: err };
			}
			const compiled = compileWorkflow(resolved.workflow, resolved.filePath);
			if (compiled.flatSteps.length === 0) {
				const err = `Workflow file "${filePath}" contains no executable steps.`;
				writeErr(err);
				return { exitCode: 1, output: err };
			}
			const nextActive = startWorkflow(compiled);
			saveWorkflow(conversationId, nextActive.workflow, env);
			saveState(conversationId, nextActive.state, env);
			const firstStep = compiled.flatSteps[0];
			const msg = `[WORKFLOW STARTED] "${nextActive.workflow.name}"\nStep 1/${compiled.flatSteps.length}: ${firstStep.title}\n${firstStep.instruction}`;
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}

		if (parsed.command === "next") {
			const active = loadActiveWorkflow(conversationId, env);

			if (
				!active ||
				(active.state.status !== "active" && active.state.status !== "paused")
			) {
				const err =
					"No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.";
				writeErr(err);
				return { exitCode: 1, output: err };
			}

			const nextState = resumeWorkflow(active.state);
			saveState(conversationId, nextState, env);
			const currentStep = active.workflow.flatSteps[nextState.step];
			const stepNum = nextState.step + 1;
			const total = active.workflow.flatSteps.length;
			const title = currentStep?.title || `Step ${stepNum}`;
			const msg = `[STEP ${stepNum}/${total}] ${title}\n${currentStep?.instruction || ""}`;
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}

		if (parsed.command === "show") {
			const active = loadActiveWorkflow(conversationId, env);

			if (!active) {
				const msg = "[WORKFLOW STATUS]\nNo workflow is currently loaded.";
				writeOut(msg);
				return { exitCode: 0, output: msg };
			}
			const currentStep = active.workflow.flatSteps[active.state.step];
			const currentLevel = currentStep?.level ?? 0;
			const stepInfo =
				active.state.status !== "finished"
					? `Step: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${currentLevel})`
					: "All steps completed";
			const statusHeader = `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]\nWorkflow: ${active.workflow.name}\n${stepInfo}`;
			const prompt = visualizeWorkflowPrompt(
				active.workflow.name,
				active.workflow,
				active.workflow.filePath,
				active.state.status === "active" || active.state.status === "paused"
					? active.state.step
					: undefined,
				statusHeader,
			);
			writeOut(prompt);
			return { exitCode: 0, output: prompt };
		}
	}

	if (!parsed.command) {
		const help = getCliHelp();
		writeOut(help);
		return { exitCode: 0, output: help };
	}

	const err = `Unknown command: "${parsed.command}". Run "wf --help" for available commands.`;
	writeErr(err);
	return { exitCode: 1, output: err };
}

const isCliEntry =
	Boolean(process.argv[1]) &&
	(process.argv[1].endsWith("cli.ts") ||
		process.argv[1].endsWith("wf.cjs") ||
		process.argv[1].endsWith("/wf") ||
		process.argv[1].endsWith("\\wf"));

if (isCliEntry) {
	runCli()
		.then(({ exitCode }) => {
			if (exitCode !== 0) {
				process.exit(exitCode);
			}
		})
		.catch((err) => {
			logDebug("Unexpected CLI error", err);
			process.exit(1);
		});
}
