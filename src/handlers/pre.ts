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
import type { ExtractWorkflowState, WorkflowState } from "../state.ts";
import {
	pauseWorkflow,
	prepareStepExecution,
} from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";

function handleCommand(
	info: HookInfo,
	state: WorkflowState | null,
	parsedCmd: ParseResult,
): HandleResult {
	if (parsedCmd.error) {
		return {
			state,
			response: injectSystemMessage(
				"CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER: " +
					(parsedCmd.helpText || `[Workflow Error] ${parsedCmd.error}`),
			),
		};
	}

	if (!parsedCmd.command) {
		return { state, response: {} };
	}

	switch (parsedCmd.command.name) {
		case "help": {
			const paused = pauseWorkflow(state);
			return {
				state: paused,
				response: injectSystemMessage(parsedCmd.helpText || getHelpText()),
			};
		}

		case "show": {
			const paused = pauseWorkflow(state);
			return show(info, paused, parsedCmd.command);
		}

		case "next":
			return nextPre(info, state);

		case "stop":
			return stopWorkflow(info, state);

		case "run":
			return run(info, state, parsedCmd.command);
	}
}

function dispatchStep(
	info: HookInfo,
	state: ExtractWorkflowState<"active">,
): HandleResult {
	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	if (!currentStep) {
		return { state, response: {} };
	}

	return step(info, state);
}

/**
 * Handles the PreInvocation lifecycle hook.
 * Dispatches user commands, handles user interruptions,
 * enforces safety limits, and injects step instruction prompts.
 */
export function handlePre(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	// Process any new user input
	if (info.latestMessage && info.latestMessage.type === "USER_INPUT") {
		const parsedCmd = parseCommand(info.latestMessage.content);

		if (parsedCmd.isWfCommand) {
			return handleCommand(info, state, parsedCmd);
		}

		if (state?.status === "active") {
			logDebug("User message received, pausing workflow", {
				text: info.latestMessage.content.slice(0, 50),
			});
			return {
				state: pauseWorkflow(state),
				response: {},
			};
		}

		return { state, response: {} };
	}

	// If no workflow is active, do nothing
	if (state?.status !== "active") {
		return { state, response: {} };
	}

	// Safeguard against runaway loops
	const stepExec = prepareStepExecution(state);
	if (stepExec.exceeded) {
		return {
			state: stepExec.state,
			response: injectSystemMessage(
				`[WORKFLOW RUNNER] Workflow terminated: Exceeded safety iteration limit (${stepExec.maxIterations}).`,
			),
		};
	}

	return dispatchStep(info, stepExec.state as ExtractWorkflowState<"active">);
}
