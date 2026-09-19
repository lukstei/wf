import { getHelpText, type ShowCommand } from "../lib/parseCommand.ts";
import { visualizeWorkflowPrompt } from "../lib/visualize.ts";
import { defaultWorkflowResolver } from "../resolver.ts";
import type { ActiveWorkflow } from "../state.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { injectSystemMessage } from "./formatters.ts";

/**
 * Show action: resolves workflow file or visualizes the active workflow with current step highlighted.
 */
export function show(
	info: HookInfo,
	active: ActiveWorkflow | null,
	command?: ShowCommand,
): HandleResult {
	const targetPath = command?.args.path?.trim() ?? "";

	// 1. Invoked without parameter: inspect currently active/loaded workflow state
	if (!targetPath) {
		if (!active) {
			return {
				active,
				response: injectSystemMessage(
					"[WORKFLOW STATUS]\nNo workflow is currently loaded. Run /wf <workflow-file> to start a workflow, or /wf-show <workflow-file> to inspect one.",
				),
			};
		}

		if (active.state.status === "finished") {
			return {
				active,
				response: injectSystemMessage(
					`[WORKFLOW STATUS: FINISHED]\nWorkflow "${active.workflow.name}" completed successfully.`,
				),
			};
		}

		if (active.state.status === "error") {
			return {
				active,
				response: injectSystemMessage(
					`[WORKFLOW STATUS: ERROR]\nWorkflow: ${active.workflow.name}\nError: ${active.state.error}`,
				),
			};
		}

		// Active or paused state: show diagram with active step highlighted + status header
		const currentLevel =
			active.workflow.flatSteps[active.state.step]?.level ?? 0;
		const statusHeader = `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]\nWorkflow: ${active.workflow.name}\nStep: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${currentLevel})`;
		const prompt = visualizeWorkflowPrompt(
			active.workflow.name,
			active.workflow,
			active.workflow.filePath,
			active.state.step,
			statusHeader,
		);

		return {
			active,
			response: injectSystemMessage(prompt),
		};
	}

	// 2. Invoked with parameter: resolve workflow file and visualize
	const resolved = defaultWorkflowResolver(
		targetPath,
		info.payload.workspacePaths,
	);

	if (!resolved) {
		return {
			active,
			response: injectSystemMessage(
				getHelpText(
					`Workflow file not found: "${targetPath}". Please check the path and try again.`,
				),
			),
		};
	}

	if ("error" in resolved) {
		return {
			active,
			response: injectSystemMessage(getHelpText(resolved.error)),
		};
	}

	const isActiveWorkflow =
		active &&
		(active.state.status === "active" || active.state.status === "paused") &&
		active.workflow.filePath === resolved.filePath;

	const activeStepIndex = isActiveWorkflow ? active.state.step : undefined;
	const statusHeader = isActiveWorkflow
		? `[WORKFLOW STATUS: ${active.state.status.toUpperCase()}]\nWorkflow: ${active.workflow.name}\nStep: ${active.state.step + 1} of ${active.workflow.flatSteps.length} (Nesting Level ${active.workflow.flatSteps[active.state.step]?.level ?? 0})`
		: undefined;

	const wfName = resolved.workflow.name;
	const prompt = visualizeWorkflowPrompt(
		wfName,
		resolved.workflow,
		resolved.filePath,
		activeStepIndex,
		statusHeader,
	);

	return {
		active,
		response: injectSystemMessage(prompt),
	};
}
