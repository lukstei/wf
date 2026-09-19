import assert from "node:assert/strict";
import type { ActiveWorkflow, WorkflowState } from "./state.ts";
import type { CompiledWorkflow, FlatStep } from "./workflow.ts";

function advanceTo(
	flatSteps: FlatStep[],
	state: WorkflowState,
	iterationCount: number,
	decision?: "YES" | "NO",
): WorkflowState {
	const current = flatSteps[state.step];
	const targetIndex =
		current?.type === "condition"
			? decision === "YES"
				? current.nextIndex
				: (current.skipIndex ?? current.nextIndex)
			: current?.nextIndex;

	const isFinished =
		targetIndex === undefined || targetIndex >= flatSteps.length;

	return {
		...state,
		step: isFinished ? flatSteps.length : targetIndex,
		status: isFinished ? "finished" : "active",
		iterationCount,
	};
}

/**
 * Initializes and starts a workflow in active mode.
 * Sets the execution pointer to step 0 with iterationCount 0.
 */
export function startWorkflow(workflow: CompiledWorkflow): ActiveWorkflow {
	if (workflow.flatSteps.length === 0) {
		throw new Error(
			`Cannot start workflow "${workflow.name}": contains no executable steps.`,
		);
	}

	return {
		state: {
			status: "active",
			step: 0,
			iterationCount: 0,
		},
		workflow,
	};
}

/**
 * Pauses an active workflow.
 * If the workflow is not active (e.g. paused, finished, error, or null),
 * the state is returned unchanged.
 */
export function pauseWorkflow(
	state: WorkflowState | null,
): WorkflowState | null {
	if (state?.status === "active") {
		return {
			...state,
			status: "paused",
		};
	}
	return state;
}

/**
 * Resumes an active or paused workflow (triggered by /wf next).
 * If paused at a gate step, advances to the target step.
 * Precondition: state must be in an active or paused status.
 */
export function resumeWorkflow(
	flatSteps: FlatStep[],
	state: WorkflowState | null,
): WorkflowState {
	assert(
		state && (state.status === "active" || state.status === "paused"),
		"Cannot resume workflow: no active or paused workflow is loaded",
	);

	const currentStep = flatSteps[state.step];
	if (state.status === "paused" && currentStep?.type === "gate") {
		return advanceTo(flatSteps, state, state.iterationCount);
	}

	return {
		...state,
		status: "active",
	};
}

/**
 * Pure transition advancing an active workflow to its next step upon step completion.
 * Increments iterationCount to track completed step executions.
 * If iteration count exceeds limit (steps * 5), transitions to "error" state.
 * If the completed step was a gate, transitions status to "paused".
 * Otherwise advances to the target step or transitions to "finished".
 */
export function advanceStep(
	flatSteps: FlatStep[],
	state: WorkflowState | null,
	decision?: "YES" | "NO",
): WorkflowState | null {
	if (state?.status !== "active") {
		return state;
	}

	const nextIterationCount = state.iterationCount + 1;
	const maxIterations = flatSteps.length * 5;

	if (nextIterationCount > maxIterations) {
		return {
			status: "error",
			step: state.step,
			error: `Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`,
			iterationCount: nextIterationCount,
		};
	}

	const currentStep = flatSteps[state.step];
	if (currentStep?.type === "gate") {
		return {
			step: state.step,
			status: "paused",
			iterationCount: nextIterationCount,
		};
	}

	return advanceTo(flatSteps, state, nextIterationCount, decision);
}

/**
 * Transitions an active or paused workflow into an error state.
 * If the state is not currently running, returns it unchanged.
 */
export function failWorkflow(
	state: WorkflowState | null,
	error: string,
): WorkflowState | null {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return state;
	}

	return {
		status: "error",
		step: state.step,
		iterationCount: state.iterationCount,
		error,
	};
}

export interface StopWorkflowResult {
	state: WorkflowState | null;
	wasRunning: boolean;
	workflowName?: string;
}

/**
 * Stops and transitions an active or paused workflow to finished status.
 * Returns metadata indicating whether an active or paused workflow was terminated.
 */
export function stopWorkflowState(
	state: WorkflowState | null,
	workflowName?: string,
): StopWorkflowResult {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: null, wasRunning: false };
	}

	return {
		state: {
			status: "finished",
			step: state.step,
			iterationCount: state.iterationCount,
		},
		wasRunning: true,
		workflowName,
	};
}
