import { assert } from "./lib/assert.ts";
import type { ExtractWorkflowState, WorkflowState } from "./state.ts";
import { nextStep, type WorkflowInfo } from "./workflow.ts";

/**
 * Initializes and starts a workflow in active mode.
 * Sets the execution pointer to step 0 with iterationCount 1.
 */
export function startWorkflow(
	workflow: WorkflowInfo,
): ExtractWorkflowState<"active"> {
	if (workflow.flatSteps.length === 0) {
		throw new Error(
			`Cannot start workflow "${workflow.name}": contains no executable steps.`,
		);
	}

	return {
		status: "active",
		currentStepIndex: 0,
		iterationCount: 1,
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
 * Sets status to "active" so execution proceeds.
 * Precondition: state must be in an active or paused status.
 */
export function resumeWorkflow(
	state: WorkflowState | null,
): ExtractWorkflowState<"active"> {
	assert(
		state && (state.status === "active" || state.status === "paused"),
		"Cannot resume workflow: no active or paused workflow is loaded",
	);

	return {
		...state,
		status: "active",
	};
}

/**
 * Pure transition advancing an active workflow to its next step.
 * Computes the target step index using nextStep().
 * If the target index reaches or exceeds the total step count, transitions to "finished".
 * If the completed step was a gate, transitions status to "paused".
 * Otherwise keeps status as "active".
 */
export function advanceStep(
	state: WorkflowState | null,
	decision?: "YES" | "NO",
): WorkflowState | null {
	if (!state || state.status !== "active") {
		return state;
	}

	const currentStep = state.workflow.flatSteps[state.currentStepIndex];
	const targetIndex = nextStep(
		state.workflow.flatSteps,
		state.currentStepIndex,
		decision,
	);

	if (targetIndex >= state.workflow.flatSteps.length) {
		return {
			status: "finished",
			workflow: state.workflow,
		};
	}

	const isGate = currentStep?.type === "gate";

	return {
		...state,
		currentStepIndex: targetIndex,
		status: isGate ? "paused" : "active",
	};
}

export interface StepExecutionResult {
	state: WorkflowState;
	exceeded: boolean;
	maxIterations: number;
}

/**
 * Checks runaway loop iteration limits and prepares the next step dispatch for an active workflow.
 * If iteration count exceeds limit (steps * 5), transitions to "error" state.
 * Otherwise increments iterationCount.
 */
export function prepareStepExecution(
	state: ExtractWorkflowState<"active">,
): StepExecutionResult {
	const maxIterations = state.workflow.flatSteps.length * 5;
	const nextIterationCount = (state.iterationCount ?? 0) + 1;

	if (nextIterationCount > maxIterations) {
		return {
			exceeded: true,
			maxIterations,
			state: {
				...state,
				status: "error",
				error: `Workflow terminated: Exceeded safety iteration limit (${maxIterations}).`,
			},
		};
	}

	return {
		exceeded: false,
		maxIterations,
		state: {
			...state,
			iterationCount: nextIterationCount,
		},
	};
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
		...state,
		status: "error",
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
): StopWorkflowResult {
	if (!state || (state.status !== "active" && state.status !== "paused")) {
		return { state: null, wasRunning: false };
	}

	return {
		state: {
			status: "finished",
			workflow: state.workflow,
		},
		wasRunning: true,
		workflowName: state.workflow.name,
	};
}
