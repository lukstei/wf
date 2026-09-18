import {
	type ProblemId,
	type ProblemSource,
	STEP_CHECKS,
	WORKFLOW_CHECKS,
} from "./validator-checks.ts";
import type { ConditionalStep, WorkflowAst, WorkflowStep } from "./workflow.ts";

export * from "./validator-checks.ts";

export const PROBLEM_SEVERITY: Record<ProblemId, "warning" | "error"> = {
	"workflow-missing-name": "error",
	"workflow-missing-description": "warning",
	"workflow-no-steps": "error",
	"step-missing-title": "error",
	"step-action-empty-instruction": "error",
	"step-gate-empty-instruction": "error",
	"step-condition-empty-expression": "error",
	"step-condition-empty-yes": "error",
	"step-condition-empty-no": "warning",
} as const;

export type ProblemSeverity = "warning" | "error";

export interface ValidationProblem {
	id: ProblemId;
	type: ProblemSeverity;
	description: string;
	source: ProblemSource;
}

export interface ValidationStats {
	totalSteps: number;
	linearSteps: number;
	conditions: number;
	gates: number;
}

export interface ValidationResult {
	valid: boolean;
	stats: ValidationStats;
	problems: ValidationProblem[];
}

export function validateWorkflow(def: WorkflowAst): ValidationResult {
	const problems: ValidationProblem[] = [];

	for (const check of WORKFLOW_CHECKS) {
		for (const p of check(def)) {
			problems.push({ ...p, type: PROBLEM_SEVERITY[p.id] });
		}
	}

	let totalSteps = 0;
	let linearSteps = 0;
	let conditions = 0;
	let gates = 0;

	if (Array.isArray(def.steps)) {
		function validateStep(step: WorkflowStep) {
			totalSteps++;
			if (step.type === "step") {
				linearSteps++;
			} else if (step.type === "gate") {
				gates++;
			} else if (step.type === "condition") {
				conditions++;
			}

			for (const check of STEP_CHECKS) {
				for (const p of check(step)) {
					problems.push({ ...p, type: PROBLEM_SEVERITY[p.id] });
				}
			}

			if (step.type === "condition") {
				const condStep = step as ConditionalStep;
				if (condStep.yes?.steps) {
					for (const child of condStep.yes.steps) {
						validateStep(child);
					}
				}
				if (condStep.no?.steps) {
					for (const child of condStep.no.steps) {
						validateStep(child);
					}
				}
			}
		}

		for (const step of def.steps) {
			validateStep(step);
		}
	}

	const valid = !problems.some((p) => p.type === "error");

	return {
		valid,
		stats: { totalSteps, linearSteps, conditions, gates },
		problems,
	};
}
