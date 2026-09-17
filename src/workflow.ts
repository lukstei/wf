interface BaseStep {
	title: string;
}

export type Step = BaseStep & {
	type: "step";
	instruction: string;
};

interface Branch {
	preamble?: string;
	steps: WorkflowStep[];
}

export type ConditionalStep = BaseStep & {
	type: "condition";
	condition: string;
	yes: Branch;
	no?: Branch;
};

export type GateStep = BaseStep & {
	type: "gate";
	instruction: string;
};

export type WorkflowStep = Step | ConditionalStep | GateStep;

export function isConditionalStep(step: WorkflowStep): step is ConditionalStep {
	return step.type === "condition";
}

export function isGateStep(step: WorkflowStep): step is GateStep {
	return step.type === "gate";
}

export function isStep(step: WorkflowStep): step is Step {
	return step.type === "step";
}

export interface FlatStep {
	index: number;
	level: number;
	id?: string;
	title?: string;
	type: "step" | "condition" | "gate";
	instruction?: string;
	condition?: string;
	branchPreamble?: string;
	nextIndex: number;
	skipIndex?: number;
}

export interface WorkflowDef {
	name?: string;
	description?: string;
	preamble?: string;
	steps: WorkflowStep[];
}

export interface WorkflowInfo {
	name: string;
	filePath: string;
	description?: string;
	preamble?: string;
	steps?: WorkflowStep[];
	flatSteps: FlatStep[];
}

/**
 * Recursively flattens a nested workflow AST into a linear instruction sequence
 * with pre-computed nesting levels and jump offsets.
 */
export function flattenWorkflow(workflowSteps: WorkflowStep[]): FlatStep[] {
	const flat: FlatStep[] = [];
	const fixups: Array<() => void> = [];

	function compile(
		steps: WorkflowStep[],
		level: number,
		exitTarget: () => number,
		branchPreamble?: string,
	) {
		const stepStartIndices: number[] = new Array(steps.length);

		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			const isLast = i === steps.length - 1;
			const myIndex = flat.length;
			stepStartIndices[i] = myIndex;

			const afterThisStep = isLast ? exitTarget : () => stepStartIndices[i + 1];

			const preambleForThisStep = i === 0 ? branchPreamble : undefined;

			if (isConditionalStep(step)) {
				const title = step.title || step.condition || "Condition";
				const condStep: FlatStep = {
					index: myIndex,
					level,
					title,
					type: "condition",
					condition: step.condition,
					...(preambleForThisStep
						? { branchPreamble: preambleForThisStep }
						: {}),
					nextIndex: 0,
					skipIndex: 0,
				};
				flat.push(condStep);

				const yesSteps = step.yes.steps;
				const noSteps = step.no?.steps ?? [];

				let yesStartIndex = -1;
				let noStartIndex = -1;

				if (yesSteps.length > 0) {
					yesStartIndex = flat.length;
					compile(yesSteps, level + 1, afterThisStep, step.yes.preamble);
				}

				if (noSteps.length > 0) {
					noStartIndex = flat.length;
					compile(noSteps, level + 1, afterThisStep, step.no?.preamble);
				}

				fixups.push(() => {
					const afterCond = afterThisStep();
					condStep.nextIndex = yesSteps.length > 0 ? yesStartIndex : afterCond;
					condStep.skipIndex = noSteps.length > 0 ? noStartIndex : afterCond;
				});
			} else if (isGateStep(step)) {
				const title = step.title || step.instruction || "Gate";
				const flatStep: FlatStep = {
					index: myIndex,
					level,
					title,
					type: "gate",
					instruction: step.instruction,
					...(preambleForThisStep
						? { branchPreamble: preambleForThisStep }
						: {}),
					nextIndex: 0,
				};
				flat.push(flatStep);

				fixups.push(() => {
					flatStep.nextIndex = afterThisStep();
				});
			} else {
				const title = step.title || step.instruction || "Step";
				const flatStep: FlatStep = {
					index: myIndex,
					level,
					title,
					type: "step",
					instruction: step.instruction,
					...(preambleForThisStep
						? { branchPreamble: preambleForThisStep }
						: {}),
					nextIndex: 0,
				};
				flat.push(flatStep);

				fixups.push(() => {
					flatStep.nextIndex = afterThisStep();
				});
			}
		}
	}

	compile(workflowSteps, 0, () => flat.length);

	for (const fixup of fixups) {
		fixup();
	}

	return flat;
}

/**
 * Pure, deterministic O(1) jump calculation for the next step index.
 */
export function nextStep(
	flatSteps: FlatStep[],
	currentIndex: number,
	decision?: "YES" | "NO",
): number {
	const current = flatSteps[currentIndex];
	if (!current) return flatSteps.length;

	if (current.type === "condition") {
		if (decision === "YES") {
			return current.nextIndex;
		}
		return current.skipIndex ?? current.nextIndex;
	}

	return current.nextIndex;
}
