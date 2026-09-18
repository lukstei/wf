import type { ConditionalStep, WorkflowDef, WorkflowStep } from "./workflow.ts";

export interface ValidationError {
	message: string;
	stepTitle?: string;
}

export interface ValidationWarning {
	message: string;
	stepTitle?: string;
}

export interface ValidationStats {
	totalSteps: number;
	linearSteps: number;
	conditions: number;
	gates: number;
}

export type ValidationResult =
	| {
			valid: true;
			stats: ValidationStats;
			warnings: ValidationWarning[];
	  }
	| {
			valid: false;
			errors: ValidationError[];
			warnings: ValidationWarning[];
	  };

export function validateWorkflow(def: WorkflowDef): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];

	if (!def.name || def.name.trim().length === 0) {
		errors.push({
			message:
				'Workflow must define a non-empty name (via YAML frontmatter "name" or Markdown H1 title).',
		});
	}

	if (!def.description || def.description.trim().length === 0) {
		warnings.push({
			message: "Workflow lacks a description in YAML frontmatter.",
		});
	}

	if (!Array.isArray(def.steps) || def.steps.length === 0) {
		errors.push({
			message: "Workflow contains no actionable steps.",
		});
		return { valid: false, errors, warnings };
	}

	let totalSteps = 0;
	let linearSteps = 0;
	let conditions = 0;
	let gates = 0;

	function validateStep(step: WorkflowStep) {
		totalSteps++;

		const title = step.title?.trim();
		if (!title) {
			errors.push({ message: "Step title cannot be empty." });
		}

		if (step.type === "step") {
			linearSteps++;
			if (!step.instruction || step.instruction.trim().length === 0) {
				errors.push({
					stepTitle: title,
					message: `Action step "${title || "untitled"}" has empty instructions.`,
				});
			}
			return;
		}

		if (step.type === "gate") {
			gates++;
			if (!step.instruction || step.instruction.trim().length === 0) {
				errors.push({
					stepTitle: title,
					message: `Gate step "${title || "untitled"}" has empty verification instructions.`,
				});
			}
			return;
		}

		if (step.type === "condition") {
			conditions++;
			const condStep = step as ConditionalStep;
			if (!condStep.condition || condStep.condition.trim().length === 0) {
				errors.push({
					stepTitle: title,
					message: `Condition step "${title || "untitled"}" has an empty condition expression.`,
				});
			}

			if (
				!condStep.yes ||
				!Array.isArray(condStep.yes.steps) ||
				condStep.yes.steps.length === 0
			) {
				errors.push({
					stepTitle: title,
					message: `Condition step "${title || "untitled"}" has no YES branch steps.`,
				});
			} else {
				for (const child of condStep.yes.steps) {
					validateStep(child);
				}
			}

			if (condStep.no) {
				if (
					(!condStep.no.steps || condStep.no.steps.length === 0) &&
					!condStep.no.preamble
				) {
					warnings.push({
						stepTitle: title,
						message: `Condition step "${title || "untitled"}" defines an empty NO branch.`,
					});
				} else if (condStep.no.steps) {
					for (const child of condStep.no.steps) {
						validateStep(child);
					}
				}
			}
		}
	}

	for (const step of def.steps) {
		validateStep(step);
	}

	if (errors.length > 0) {
		return { valid: false, errors, warnings };
	}

	return {
		valid: true,
		stats: { totalSteps, linearSteps, conditions, gates },
		warnings,
	};
}
