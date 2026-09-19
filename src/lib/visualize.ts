import {
	type CompiledWorkflow,
	type FlatStep,
	flattenWorkflow,
	type WorkflowAst,
	type WorkflowStep,
} from "../workflow.ts";

export type VisualizableWorkflow = WorkflowAst | CompiledWorkflow;

function escapeLabel(text: string): string {
	return text.replace(/"/g, "#quot;").replace(/\r?\n/g, "<br/>");
}

function getFlatSteps(workflow: VisualizableWorkflow): FlatStep[] {
	return "flatSteps" in workflow
		? workflow.flatSteps
		: flattenWorkflow(workflow.steps);
}

/**
 * Converts a workflow definition into a minimal Mermaid flowchart TD diagram.
 */
export function visualize(
	workflow: VisualizableWorkflow,
	activeStepIndex?: number,
): string {
	const flatSteps = getFlatSteps(workflow);
	if (flatSteps.length === 0) return "flowchart TD";

	const lines: string[] = ["flowchart TD"];

	// 1. Declare all node shapes and labels first to ensure proper rendering
	for (const step of flatSteps) {
		const id = `s${step.index}`;
		const isActive =
			activeStepIndex !== undefined && step.index === activeStepIndex;
		const prefix = isActive ? "▶ " : "";

		if (step.type === "condition") {
			const rawLabel = `${prefix}${step.title}`;
			const label = escapeLabel(rawLabel);
			lines.push(`    ${id}{{"<i>${label}</i>"}}`);
		} else if (step.type === "gate") {
			const rawLabel = `${prefix}${step.title}`;
			const label = escapeLabel(rawLabel);
			lines.push(`    ${id}[["🛑 ${label}"]]`);
		} else {
			const rawLabel = `${prefix}${step.title}`;
			const label = escapeLabel(rawLabel);
			lines.push(`    ${id}["${label}"]`);
		}
	}

	// 2. Declare all transitions/edges after nodes and subgraphs have been defined
	for (const step of flatSteps) {
		const id = `s${step.index}`;
		if (step.type === "condition") {
			if (step.nextIndex < flatSteps.length) {
				lines.push(`    ${id} -->|Yes| s${step.nextIndex}`);
			}
			if (step.skipIndex !== undefined && step.skipIndex < flatSteps.length) {
				lines.push(`    ${id} -->|No| s${step.skipIndex}`);
			}
		} else {
			if (step.nextIndex < flatSteps.length) {
				lines.push(`    ${id} --> s${step.nextIndex}`);
			}
		}
	}

	// 3. Highlight active step if specified
	if (
		activeStepIndex !== undefined &&
		activeStepIndex >= 0 &&
		activeStepIndex < flatSteps.length
	) {
		lines.push(`    style s${activeStepIndex} stroke:#3b82f6,stroke-width:4px`);
	}

	return lines.join("\n");
}

/**
 * Converts a workflow definition into a hierarchical plain text outline.
 */
export function visualizePlainText(
	workflow: WorkflowAst,
	activeStepIndex?: number,
): string {
	if (workflow.steps.length === 0) return "";

	const lines: string[] = [];
	let stepIndex = 0;

	function walk(stepList: WorkflowStep[], indent: string) {
		for (const step of stepList) {
			const myIndex = stepIndex++;
			const isActive =
				activeStepIndex !== undefined && myIndex === activeStepIndex;
			const marker = isActive ? "▶ [CURRENT] " : "";

			if (step.type === "condition") {
				const label = step.title || step.condition || "Condition";
				lines.push(`${indent}${marker}- If: ${label}`);
				if (step.yes && step.yes.steps.length > 0) {
					walk(step.yes.steps, `${indent}  `);
				}
				if (step.no && step.no.steps.length > 0) {
					lines.push(`${indent}- Else:`);
					walk(step.no.steps, `${indent}  `);
				}
			} else if (step.type === "gate") {
				const label = step.title || step.instruction || "Gate";
				lines.push(`${indent}${marker}- Gate: ${label} [Approval Required]`);
			} else {
				const label = step.title || step.instruction || "Step";
				lines.push(`${indent}${marker}- Step: ${label}`);
			}
		}
	}

	walk(workflow.steps, "");
	return lines.join("\n");
}

/**
 * Formats the visualization prompt instructing the agent to display the workflow.
 */
export function visualizeWorkflowPrompt(
	name: string,
	workflow: VisualizableWorkflow,
	filePath?: string,
	activeStepIndex?: number,
	statusHeader?: string,
): string {
	const mermaid = visualize(workflow, activeStepIndex);
	const plainText = visualizePlainText(workflow, activeStepIndex);
	const fileRef = filePath ? ` ("${filePath}")` : "";

	const lines: string[] = [];

	if (statusHeader) {
		lines.push(statusHeader, "");
	}

	lines.push(
		`[WORKFLOW VISUALIZATION: ${name}]`,
		`Present the structure of workflow "${name}" to the user.`,
		"",
		"If your environment supports rendering Mermaid diagrams, visualize it using:",
		"```mermaid",
		mermaid,
		"```",
		"",
		"If Mermaid rendering is not supported in the current interface, show the plain text representation instead:",
		"",
		plainText,
		"",
		"RULES:",
		`1. Do NOT read or inspect the workflow file${fileRef} or SKILL.md — steps are already loaded by the runner.`,
		"2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
	);

	return lines.join("\n");
}
