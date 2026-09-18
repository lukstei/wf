import { logDebug } from "../lib/logDebug.ts";
import { getHelpText } from "../lib/parseCommand.ts";
import type { WorkflowState } from "../state.ts";
import { advanceStep, stepPausedWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { conditionPre } from "./condition.ts";
import { formatAdvanceReason, injectSystemMessage } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * nextPre: Handles /wf next user command in PreInvocation.
 * Sets paused mode and injects the current step.
 */
export function nextPre(
	info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	const result = stepPausedWorkflow(state);

	if (result.error === "already_finished") {
		return {
			state: result.state,
			response: injectSystemMessage(
				"[WORKFLOW RUNNER] Workflow has already completed all steps.",
			),
		};
	}

	if (result.error === "no_workflow") {
		return {
			state: result.state,
			response: injectSystemMessage(
				getHelpText(
					"No workflow is loaded. Start a workflow with '/wf <workflow-file>'.",
				),
			),
		};
	}

	if (!result.state || result.state.currentStepIndex === undefined) {
		return {
			state: result.state,
			response: injectSystemMessage(
				"[WORKFLOW RUNNER] Workflow has already completed all steps.",
			),
		};
	}

	const nextTargetStep =
		result.state.workflow.flatSteps[result.state.currentStepIndex];
	return nextTargetStep?.type === "condition"
		? conditionPre(info, result.state)
		: step(info, result.state);
}

/**
 * nextStop: Advances to the next step after action step completion in Stop hook.
 */
export function nextStop(
	_info: HookInfo,
	state: WorkflowState | null,
): HandleResult {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: state, response: { decision: "allow" } };
	}

	const nextState = advanceStep(state);

	if (nextState?.status === "finished") {
		logDebug("All workflow steps complete", {
			totalSteps: state.workflow.flatSteps.length,
		});
		return {
			state: nextState,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "active") {
		const nextTargetStep =
			nextState.workflow.flatSteps[nextState.currentStepIndex];
		const stepNum = nextState.currentStepIndex + 1;
		const totalSteps = nextState.workflow.flatSteps.length;
		const reason = formatAdvanceReason(
			nextTargetStep,
			nextState.workflow.preamble,
		);

		logDebug("Advancing to step (auto)", {
			nextNum: stepNum,
			totalSteps,
			level: nextTargetStep.level,
		});

		return {
			state: nextState,
			response: {
				decision: "continue",
				reason,
			},
		};
	}

	// If paused, yield back to user (wait for /wf next)
	logDebug("Step finished in paused mode, yielding to user", {
		nextStep: (nextState?.currentStepIndex ?? 0) + 1,
	});
	return {
		state: nextState,
		response: { decision: "allow" },
	};
}
