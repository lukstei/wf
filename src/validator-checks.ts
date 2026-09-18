import type { ConditionalStep, WorkflowAst, WorkflowStep } from "./workflow.ts";

export type ProblemId =
	| "workflow-missing-name"
	| "workflow-missing-description"
	| "workflow-no-steps"
	| "step-missing-title"
	| "step-action-empty-instruction"
	| "step-gate-empty-instruction"
	| "step-condition-empty-expression"
	| "step-condition-empty-yes"
	| "step-condition-empty-no";

export type ProblemSource =
	| { type: "workflow" }
	| { type: "step"; title: string };

export interface CheckProblem {
	id: ProblemId;
	description: string;
	source: ProblemSource;
}

export function checkWorkflowName(def: WorkflowAst): CheckProblem[] {
	if (!def.name || def.name.trim().length === 0) {
		return [
			{
				id: "workflow-missing-name",
				description:
					'Workflow must define a non-empty name (via YAML frontmatter "name" or Markdown H1 title).',
				source: { type: "workflow" },
			},
		];
	}
	return [];
}

export function checkWorkflowDescription(def: WorkflowAst): CheckProblem[] {
	if (!def.description || def.description.trim().length === 0) {
		return [
			{
				id: "workflow-missing-description",
				description: "Workflow lacks a description in YAML frontmatter.",
				source: { type: "workflow" },
			},
		];
	}
	return [];
}

export function checkWorkflowSteps(def: WorkflowAst): CheckProblem[] {
	if (!Array.isArray(def.steps) || def.steps.length === 0) {
		return [
			{
				id: "workflow-no-steps",
				description: "Workflow contains no actionable steps.",
				source: { type: "workflow" },
			},
		];
	}
	return [];
}

export function checkStepTitle(step: WorkflowStep): CheckProblem[] {
	const title = step.title?.trim();
	if (!title) {
		return [
			{
				id: "step-missing-title",
				description: "Step title cannot be empty.",
				source: { type: "step", title: step.title || "" },
			},
		];
	}
	return [];
}

export function checkActionStepInstruction(step: WorkflowStep): CheckProblem[] {
	if (step.type === "step" && (!step.instruction || step.instruction.trim().length === 0)) {
		const title = step.title?.trim() || "untitled";
		return [
			{
				id: "step-action-empty-instruction",
				description: `Action step "${title}" has empty instructions.`,
				source: { type: "step", title },
			},
		];
	}
	return [];
}

export function checkGateStepInstruction(step: WorkflowStep): CheckProblem[] {
	if (step.type === "gate" && (!step.instruction || step.instruction.trim().length === 0)) {
		const title = step.title?.trim() || "untitled";
		return [
			{
				id: "step-gate-empty-instruction",
				description: `Gate step "${title}" has empty verification instructions.`,
				source: { type: "step", title },
			},
		];
	}
	return [];
}

export function checkConditionStepExpression(step: WorkflowStep): CheckProblem[] {
	if (step.type === "condition") {
		const condStep = step as ConditionalStep;
		if (!condStep.condition || condStep.condition.trim().length === 0) {
			const title = step.title?.trim() || "untitled";
			return [
				{
					id: "step-condition-empty-expression",
					description: `Condition step "${title}" has an empty condition expression.`,
					source: { type: "step", title },
				},
			];
		}
	}
	return [];
}

export function checkConditionStepYes(step: WorkflowStep): CheckProblem[] {
	if (step.type === "condition") {
		const condStep = step as ConditionalStep;
		if (!condStep.yes || !Array.isArray(condStep.yes.steps) || condStep.yes.steps.length === 0) {
			const title = step.title?.trim() || "untitled";
			return [
				{
					id: "step-condition-empty-yes",
					description: `Condition step "${title}" has no YES branch steps.`,
					source: { type: "step", title },
				},
			];
		}
	}
	return [];
}

export function checkConditionStepNo(step: WorkflowStep): CheckProblem[] {
	if (step.type === "condition") {
		const condStep = step as ConditionalStep;
		if (
			condStep.no &&
			(!condStep.no.steps || condStep.no.steps.length === 0) &&
			!condStep.no.preamble
		) {
			const title = step.title?.trim() || "untitled";
			return [
				{
					id: "step-condition-empty-no",
					description: `Condition step "${title}" defines an empty NO branch.`,
					source: { type: "step", title },
				},
			];
		}
	}
	return [];
}

export const WORKFLOW_CHECKS = [
	checkWorkflowName,
	checkWorkflowDescription,
	checkWorkflowSteps,
];

export const STEP_CHECKS = [
	checkStepTitle,
	checkActionStepInstruction,
	checkGateStepInstruction,
	checkConditionStepExpression,
	checkConditionStepYes,
	checkConditionStepNo,
];
