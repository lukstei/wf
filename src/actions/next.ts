import { assert } from "../lib/assert.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { ActiveWorkflow } from "../state.ts";
import { advanceStep, resumeWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { formatAdvanceReason, injectSystemMessage } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * nextPre: Handles /wf next user command in PreInvocation.
 * Resumes workflow in active mode and injects the current step.
 */
export function nextPre(
	info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	assert(
		active &&
			(active.state.status === "active" || active.state.status === "paused"),
		"No workflow is running",
	);

	const nextState = resumeWorkflow(active.workflow.flatSteps, active.state);
	const nextActive = { ...active, state: nextState };

	if (nextState.status === "finished") {
		return {
			active: nextActive,
			response: injectSystemMessage(
				`[WORKFLOW STATUS: FINISHED]\nWorkflow "${active.workflow.name}" completed successfully.`,
			),
		};
	}

	return step(info, nextActive);
}

/**
 * nextStop: Advances to the next step after action step completion in Stop hook.
 * Precondition: workflow must be active.
 */
export function nextStop(
	_info: HookInfo,
	active: ActiveWorkflow | null,
): HandleResult {
	assert(
		active?.state.status === "active",
		"nextStop requires an active workflow",
	);

	const nextState = advanceStep(active.workflow.flatSteps, active.state);
	const nextActive = nextState ? { ...active, state: nextState } : null;

	if (nextState?.status === "finished") {
		logDebug("All workflow steps complete", {
			totalSteps: active.workflow.flatSteps.length,
		});
		return {
			active: nextActive,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "error") {
		logDebug("Workflow terminated on error", { error: nextState.error });
		return {
			active: nextActive,
			response: { decision: "allow" },
		};
	}

	if (nextState?.status === "active") {
		const nextTargetStep = active.workflow.flatSteps[nextState.step];
		const stepNum = nextState.step + 1;
		const totalSteps = active.workflow.flatSteps.length;
		const reason = formatAdvanceReason(
			nextTargetStep,
			active.workflow.preamble,
		);

		logDebug("Advancing to step (auto)", {
			nextNum: stepNum,
			totalSteps,
			level: nextTargetStep.level,
		});

		return {
			active: nextActive,
			response: {
				decision: "continue",
				reason,
			},
		};
	}

	// If paused (e.g. at a gate), yield back to user (wait for /wf next)
	logDebug("Step finished at gate, yielding to user", {
		nextStep: (nextState?.step ?? 0) + 1,
	});
	return {
		active: nextActive,
		response: { decision: "allow" },
	};
}
