import * as path from "node:path";
import { getHelpText, type RunCommand } from "../lib/parseCommand.ts";
import { defaultWorkflowResolver } from "../resolver.ts";
import type { WorkflowState } from "../state.ts";
import { startWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { flattenWorkflow } from "../workflow.ts";
import { injectSystemMessage } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * Run action: resolves workflow file, flattens steps, initializes state, and injects step 0.
 */
export function run(
	info: HookInfo,
	state: WorkflowState | null,
	command: RunCommand,
): HandleResult {
	const targetPath = command.args.path ?? "";

	if (!targetPath) {
		return {
			state: state,
			response: injectSystemMessage(
				getHelpText("Missing workflow file path for /wf."),
			),
		};
	}

	const resolver = info.workflowResolver || defaultWorkflowResolver;
	const resolved = resolver(targetPath, info.payload.workspacePaths);

	if (!resolved) {
		return {
			state: state,
			response: injectSystemMessage(
				getHelpText(
					`Workflow file not found: "${targetPath}". Please check the path and try again.`,
				),
			),
		};
	}

	if ("error" in resolved) {
		return {
			state: state,
			response: injectSystemMessage(getHelpText(resolved.error)),
		};
	}

	const flatSteps = flattenWorkflow(resolved.workflow.steps);
	if (flatSteps.length === 0) {
		return {
			state: state,
			response: injectSystemMessage(
				getHelpText(
					`Workflow file "${targetPath}" contains no executable steps.`,
				),
			),
		};
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

	// Inject Step 0
	return step(info, nextState);
}
