import * as path from "node:path";
import { parseArgs } from "node:util";
import { logDebug } from "./lib/logDebug.ts";
import { visualizeWorkflowPrompt } from "./lib/visualize.ts";
import { defaultWorkflowResolver } from "./resolver.ts";
import { emitEgress } from "./shim/egress.ts";
import { runShim } from "./shim/runtime-shim.ts";
import { loadState, saveState } from "./state.ts";
import {
	startWorkflow,
	stepPausedWorkflow,
	stopWorkflowState,
} from "./transitions.ts";
import { flattenWorkflow } from "./workflow.ts";

export interface ParsedCli {
	command?: string;
	subcommand?: string;
	args: string[];
	options: {
		help?: boolean;
		version?: boolean;
		[key: string]: unknown;
	};
}

export function getCliHelp(): string {
	return [
		"wf - Workflow Runner CLI",
		"",
		"Usage:",
		"  wf hook <event>       Execute harness lifecycle hook (pre, stop)",
		"  wf start <file>       Start a workflow from a Markdown or JSON file",
		"  wf show [<file>]      Show workflow status, mermaid diagram, and current step",
		"  wf next               Execute the next step of a paused workflow",
		"  wf stop               Stop and reset the active workflow",
		"  wf help               Show this help reference",
		"",
		"Options:",
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
			emitEgress(egress);
		}
		return { exitCode: egress.exitCode, output: egress.stdout };
	}

	if (parsed.command === "stop") {
		const conversationId = env.WF_CONVERSATION_ID || "default";
		const state = loadState(conversationId);
		const result = stopWorkflowState(state);
		if (result.state !== null) {
			saveState(conversationId, result.state);
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
		const conversationId = env.WF_CONVERSATION_ID || "default";
		const cwd = env.PWD || process.cwd();
		const resolved = defaultWorkflowResolver(filePath, [cwd]);
		if (!resolved || "error" in resolved) {
			const err = !resolved
				? `Workflow file not found: "${filePath}".`
				: resolved.error;
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const flatSteps = flattenWorkflow(resolved.workflow.steps);
		if (flatSteps.length === 0) {
			const err = `Workflow file "${filePath}" contains no executable steps.`;
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		const nextState = startWorkflow({
			name: resolved.workflow.name || path.basename(resolved.filePath),
			description: resolved.workflow.description,
			...(resolved.workflow.preamble
				? { preamble: resolved.workflow.preamble }
				: {}),
			filePath: resolved.filePath,
			steps: resolved.workflow.steps,
			flatSteps,
		});
		saveState(conversationId, nextState);
		const firstStep = flatSteps[0];
		const msg = `[WORKFLOW STARTED] "${nextState.workflow.name}"\nStep 1/${flatSteps.length}: ${firstStep.title}\n${firstStep.instruction}`;
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	if (parsed.command === "next") {
		const conversationId = env.WF_CONVERSATION_ID || "default";
		const state = loadState(conversationId);

		if (!state || (state.status !== "active" && state.status !== "paused")) {
			const err =
				"No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.";
			writeErr(err);
			return { exitCode: 1, output: err };
		}

		const result = stepPausedWorkflow(state);
		if (result.error === "already_finished") {
			const msg = "[WORKFLOW RUNNER] Workflow has already completed all steps.";
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}
		if (
			result.error === "no_workflow" ||
			!result.state ||
			result.state.currentStepIndex === undefined
		) {
			const err =
				"No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.";
			writeErr(err);
			return { exitCode: 1, output: err };
		}
		saveState(conversationId, result.state);
		const currentStep =
			result.state.workflow.flatSteps[result.state.currentStepIndex];
		const stepNum = result.state.currentStepIndex + 1;
		const total = result.state.workflow.flatSteps.length;
		const title = currentStep?.title || `Step ${stepNum}`;
		const msg = `[STEP ${stepNum}/${total}] ${title}\n${currentStep?.instruction || ""}`;
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	if (parsed.command === "show") {
		const conversationId = env.WF_CONVERSATION_ID || "default";
		const state = loadState(conversationId);
		const filePath = parsed.args[0];
		const cwd = env.PWD || process.cwd();
		if (filePath) {
			const resolved = defaultWorkflowResolver(filePath, [cwd]);
			if (!resolved || "error" in resolved) {
				const err = !resolved
					? `Workflow file not found: "${filePath}".`
					: resolved.error;
				writeErr(err);
				return { exitCode: 1, output: err };
			}
			const prompt = visualizeWorkflowPrompt(
				resolved.workflow.name || path.basename(resolved.filePath),
				resolved.workflow,
				resolved.filePath,
			);
			writeOut(prompt);
			return { exitCode: 0, output: prompt };
		}
		if (!state) {
			const msg = "[WORKFLOW STATUS]\nNo workflow is currently loaded.";
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}
		const currentStepIndex = state.currentStepIndex ?? 0;
		const currentStep = state.workflow.flatSteps[currentStepIndex];
		const currentLevel = currentStep?.level ?? 0;
		const stepInfo =
			state.currentStepIndex !== undefined
				? `Step: ${state.currentStepIndex + 1} of ${state.workflow.flatSteps.length} (Nesting Level ${currentLevel})`
				: "All steps completed";
		const statusHeader = `[WORKFLOW STATUS: ${state.status.toUpperCase()}]\nWorkflow: ${state.workflow.name}\n${stepInfo}`;
		const prompt = visualizeWorkflowPrompt(
			state.workflow.name,
			state.workflow,
			state.workflow.filePath,
			state.status === "active" || state.status === "paused"
				? state.currentStepIndex
				: undefined,
			statusHeader,
		);
		writeOut(prompt);
		return { exitCode: 0, output: prompt };
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
		process.argv[1].endsWith("hook-shim.cjs") ||
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
