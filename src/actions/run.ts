import { getHelpText, type RunCommand } from "../lib/parseCommand.ts";
import { defaultWorkflowResolver } from "../resolver.ts";
import type { ActiveWorkflow } from "../state.ts";
import { startWorkflow } from "../transitions.ts";
import type { HandleResult, HookInfo } from "../types.ts";
import { compileWorkflow } from "../workflow.ts";
import { injectSystemMessage } from "./formatters.ts";
import { step } from "./step.ts";

/**
 * Run action: resolves workflow file, compiles steps, initializes state, and injects step 0.
 */
export function run(
	info: HookInfo,
	active: ActiveWorkflow | null,
	command: RunCommand,
): HandleResult {
	const targetPath = command.args.path ?? "";

	if (!targetPath) {
		return {
			active,
			response: injectSystemMessage(
				getHelpText("Missing workflow file path for /wf."),
			),
		};
	}

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

	const compiled = compileWorkflow(resolved.workflow, resolved.filePath);
	if (compiled.flatSteps.length === 0) {
		return {
			active,
			response: injectSystemMessage(
				getHelpText(
					`Workflow file "${targetPath}" contains no executable steps.`,
				),
			),
		};
	}

	const nextActive = startWorkflow(compiled);

	// Inject Step 0
	return step(info, nextActive);
}
