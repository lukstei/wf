import * as path from "node:path";
import { getHelpText, type ShowCommand } from "../lib/parseCommand.ts";
import { visualizeWorkflowPrompt } from "../lib/visualize.ts";
import { defaultWorkflowResolver } from "../resolver.ts";
import type { WorkflowState } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { injectSystemMessage } from "./formatters.ts";

/**
 * Show action: resolves workflow file or visualizes the active workflow with current step highlighted.
 */
export function show(
	info: HookInfo,
	state: WorkflowState | null,
	command?: ShowCommand,
): HandleResult {
	const targetPath = command?.args.path?.trim() ?? "";

	// 1. Invoked without parameter: inspect currently active/loaded workflow state
	if (!targetPath) {
		if (!state) {
			return {
				state,
				response: injectSystemMessage(
					"[WORKFLOW STATUS]\nNo workflow is currently loaded. Run /wf <workflow-file> to start a workflow, or /wf-show <workflow-file> to inspect one.",
				),
			};
		}

		if (state.status === "finished") {
			return {
				state,
				response: injectSystemMessage(
					`[WORKFLOW STATUS: FINISHED]\nWorkflow "${state.workflow.name}" completed successfully.`,
				),
			};
		}

		if (state.status === "error") {
			return {
				state,
				response: injectSystemMessage(
					`[WORKFLOW STATUS: ERROR]\nWorkflow: ${state.workflow.name}\nError: ${state.error}`,
				),
			};
		}

		// Active or paused state: show diagram with active step highlighted + status header
		const currentLevel =
			state.workflow.flatSteps[state.currentStepIndex]?.level ?? 0;
		const statusHeader = `[WORKFLOW STATUS: ${state.status.toUpperCase()}]\nWorkflow: ${state.workflow.name}\nStep: ${state.currentStepIndex + 1} of ${state.workflow.flatSteps.length} (Nesting Level ${currentLevel})`;
		const prompt = visualizeWorkflowPrompt(
			state.workflow.name,
			state.workflow,
			state.workflow.filePath,
			state.currentStepIndex,
			statusHeader,
		);

		return {
			state,
			response: injectSystemMessage(prompt),
		};
	}

	// 2. Invoked with parameter: resolve workflow file and visualize
	const resolver = info.workflowResolver || defaultWorkflowResolver;
	const resolved = resolver(targetPath, info.payload.workspacePaths);

	if (!resolved) {
		return {
			state,
			response: injectSystemMessage(
				getHelpText(
					`Workflow file not found: "${targetPath}". Please check the path and try again.`,
				),
			),
		};
	}

	if ("error" in resolved) {
		return {
			state,
			response: injectSystemMessage(getHelpText(resolved.error)),
		};
	}

	const isActiveWorkflow =
		state &&
		(state.status === "active" || state.status === "paused") &&
		state.workflow.filePath === resolved.filePath;

	const activeStepIndex = isActiveWorkflow ? state.currentStepIndex : undefined;
	const statusHeader = isActiveWorkflow
		? `[WORKFLOW STATUS: ${state.status.toUpperCase()}]\nWorkflow: ${state.workflow.name}\nStep: ${state.currentStepIndex + 1} of ${state.workflow.flatSteps.length} (Nesting Level ${state.workflow.flatSteps[state.currentStepIndex]?.level ?? 0})`
		: undefined;

	const wfName = resolved.workflow.name || path.basename(resolved.filePath);
	const prompt = visualizeWorkflowPrompt(
		wfName,
		resolved.workflow,
		resolved.filePath,
		activeStepIndex,
		statusHeader,
	);

	return {
		state,
		response: injectSystemMessage(prompt),
	};
}
