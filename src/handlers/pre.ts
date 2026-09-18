import { injectSystemMessage } from "../actions/formatters.ts";
import { nextPre } from "../actions/next.ts";
import { run } from "../actions/run.ts";
import { show } from "../actions/show.ts";
import { step } from "../actions/step.ts";
import { stopWorkflow } from "../actions/stop.ts";
import { logDebug } from "../lib/logDebug.ts";
import {
	getHelpText,
	type ParseResult,
	parseCommand,
} from "../lib/parseCommand.ts";
import type { ActiveWorkflow } from "../state.ts";
import { failWorkflow, pauseWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";

function handleCommand(
	info: HookInfo,
	active: ActiveWorkflow | null,
	parsedCmd: ParseResult,
): HandleResult {
	if (parsedCmd.error) {
		return {
			active,
			response: injectSystemMessage(
				"CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER: " +
					(parsedCmd.helpText || `[Workflow Error] ${parsedCmd.error}`),
			),
		};
	}

	if (!parsedCmd.command) {
		return { active, response: {} };
	}

	switch (parsedCmd.command.name) {
		case "help": {
			const paused = pauseWorkflow(active?.state ?? null);
			const nextActive =
				active && paused
					? { workflow: active.workflow, state: paused }
					: active;
			return {
				active: nextActive,
				response: injectSystemMessage(parsedCmd.helpText || getHelpText()),
			};
		}

		case "show": {
			const paused = pauseWorkflow(active?.state ?? null);
			const nextActive =
				active && paused
					? { workflow: active.workflow, state: paused }
					: active;
			return show(info, nextActive, parsedCmd.command);
		}

		case "next":
			return nextPre(info, active);

		case "stop":
			return stopWorkflow(info, active);

		case "run":
			return run(info, active, parsedCmd.command);
	}
}

function dispatchStep(info: HookInfo, active: ActiveWorkflow): HandleResult {
	const currentStep = active.workflow.flatSteps[active.state.step];
	if (!currentStep) {
		return { active, response: {} };
	}

	return step(info, active);
}

/**
 * Handles the PreInvocation lifecycle hook.
 * Dispatches user commands, handles user interruptions,
 * enforces safety limits, and injects step instruction prompts.
 */
export function handlePre(
	info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	// Process any new user input
	if (info.latestMessage && info.latestMessage.type === "USER_INPUT") {
		const parsedCmd = parseCommand(info.latestMessage.content);

		if (parsedCmd.isWfCommand) {
			return handleCommand(info, active, parsedCmd);
		}

		if (active?.state.status === "active") {
			logDebug("User message received, pausing workflow", {
				text: info.latestMessage.content.slice(0, 50),
			});
			const paused = pauseWorkflow(active.state);
			return {
				active: paused ? { workflow: active.workflow, state: paused } : active,
				response: {},
			};
		}

		return { active, response: {} };
	}

	// If no workflow is active, do nothing
	if (active?.state.status !== "active") {
		return { active, response: {} };
	}

	// Safeguard against runaway loops
	const maxIterations = active.workflow.flatSteps.length * 5;
	if (active.state.iterationCount >= maxIterations) {
		const errorState = failWorkflow(
			active.state,
			`Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`,
		);
		return {
			active: errorState
				? { workflow: active.workflow, state: errorState }
				: active,
			response: injectSystemMessage(
				`[WORKFLOW RUNNER] Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`,
			),
		};
	}

	return dispatchStep(info, active);
}
