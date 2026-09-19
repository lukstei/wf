import { describe, expect, test } from "vitest";
import type { ExtractWorkflowState, WorkflowState } from "./state.ts";
import {
	advanceStep,
	failWorkflow,
	pauseWorkflow,
	resumeWorkflow,
	startWorkflow,
	stopWorkflowState,
} from "./transitions.ts";
import { type CompiledWorkflow, compileWorkflow } from "./workflow.ts";

describe("transitions.ts", () => {
	const linearWf: CompiledWorkflow = compileWorkflow(
		{
			name: "LinearFlow",
			steps: [
				{ type: "step", title: "First step", instruction: "First step" },
				{ type: "step", title: "Second step", instruction: "Second step" },
			],
		},
		"/test/linear.json",
	);

	const condWf: CompiledWorkflow = compileWorkflow(
		{
			name: "CondFlow",
			steps: [
				{ type: "step", title: "Init", instruction: "Init" },
				{
					type: "condition",
					title: "is ready?",
					condition: "is ready?",
					yes: {
						steps: [{ type: "step", title: "Deploy", instruction: "Deploy" }],
					},
					no: { steps: [{ type: "step", title: "Fix", instruction: "Fix" }] },
				},
				{ type: "step", title: "Done", instruction: "Done" },
			],
		},
		"/test/cond.json",
	);

	const gateWf: CompiledWorkflow = compileWorkflow(
		{
			name: "GateFlow",
			steps: [
				{ type: "step", title: "First step", instruction: "First step" },
				{ type: "gate", title: "Gate Check", instruction: "Verify" },
				{ type: "step", title: "Final step", instruction: "Final step" },
			],
		},
		"/test/gate.json",
	);

	const gateAsLastStepWf: CompiledWorkflow = compileWorkflow(
		{
			name: "GateLastFlow",
			steps: [
				{ type: "step", title: "First step", instruction: "First step" },
				{
					type: "gate",
					title: "Final Gate Check",
					instruction: "Verify last",
				},
			],
		},
		"/test/gate-last.json",
	);

	test("startWorkflow initializes active workflow state", () => {
		const activeState = startWorkflow(linearWf);

		expect(activeState.state).toMatchInlineSnapshot(`
			{
			  "iterationCount": 0,
			  "status": "active",
			  "step": 0,
			}
		`);
		expect(activeState.workflow).toBe(linearWf);

		expect(() =>
			startWorkflow({
				name: "Empty",
				filePath: "/empty.json",
				steps: [],
				flatSteps: [],
			}),
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot start workflow "Empty": contains no executable steps.]`,
		);
	});

	test("pauseWorkflow snapshot matrix", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 2,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
		};
		const errorState: WorkflowState = {
			status: "error",
			error: "Something failed",
			step: 0,
			iterationCount: 1,
		};

		const results = {
			fromActive: pauseWorkflow(activeState),
			fromPaused: pauseWorkflow(pausedState),
			fromFinished: pauseWorkflow(finishedState),
			fromError: pauseWorkflow(errorState),
			fromNull: pauseWorkflow(null),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "fromActive": {
			    "iterationCount": 2,
			    "status": "paused",
			    "step": 1,
			  },
			  "fromError": {
			    "error": "Something failed",
			    "iterationCount": 1,
			    "status": "error",
			    "step": 0,
			  },
			  "fromFinished": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			  },
			  "fromNull": null,
			  "fromPaused": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			  },
			}
		`);
	});

	test("resumeWorkflow snapshot matrix and precondition assertions", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
		};
		const errorState: WorkflowState = {
			status: "error",
			error: "Boom",
			step: 0,
			iterationCount: 1,
		};

		const pausedAtGate: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
		};
		const pausedAtLastGate: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
		};

		const results = {
			fromActive: resumeWorkflow(linearWf.flatSteps, activeState),
			fromPaused: resumeWorkflow(linearWf.flatSteps, pausedState),
			gateResumeAdvancesToNextStep: resumeWorkflow(
				gateWf.flatSteps,
				pausedAtGate,
			),
			lastGateResumeFinishes: resumeWorkflow(
				gateAsLastStepWf.flatSteps,
				pausedAtLastGate,
			),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "fromActive": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 0,
			  },
			  "fromPaused": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 0,
			  },
			  "gateResumeAdvancesToNextStep": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 2,
			  },
			  "lastGateResumeFinishes": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			  },
			}
		`);

		expect(() => resumeWorkflow(linearWf.flatSteps, finishedState)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
		expect(() => resumeWorkflow(linearWf.flatSteps, errorState)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
		expect(() => resumeWorkflow(linearWf.flatSteps, null)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
	});

	test("advanceStep snapshot matrix for linear and conditional progressions", () => {
		const activeLinear0: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
		};
		const pausedLinear0: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
		};
		const activeLinear1: WorkflowState = {
			status: "active",
			step: 1, // last step
			iterationCount: 1,
		};
		const pausedLinear1: WorkflowState = {
			status: "paused",
			step: 1, // last step
			iterationCount: 1,
		};

		const activeCond1: WorkflowState = {
			status: "active",
			step: 1, // condition c1
			iterationCount: 1,
		};

		const advanceAssertions = {
			activeLinearStep0To1: advanceStep(linearWf.flatSteps, activeLinear0),
			pausedLinearStep0To1: advanceStep(linearWf.flatSteps, pausedLinear0),
			activeLinearStep1ToFinish: advanceStep(linearWf.flatSteps, activeLinear1),
			pausedLinearStep1ToFinish: advanceStep(linearWf.flatSteps, pausedLinear1),
			conditionBranchYes: advanceStep(condWf.flatSteps, activeCond1, "YES"),
			conditionBranchNo: advanceStep(condWf.flatSteps, activeCond1, "NO"),
			nullStateUnchanged: advanceStep(linearWf.flatSteps, null),
		};

		expect(advanceAssertions).toMatchInlineSnapshot(`
			{
			  "activeLinearStep0To1": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 1,
			  },
			  "activeLinearStep1ToFinish": {
			    "iterationCount": 2,
			    "status": "finished",
			    "step": 2,
			  },
			  "conditionBranchNo": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 3,
			  },
			  "conditionBranchYes": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 2,
			  },
			  "nullStateUnchanged": null,
			  "pausedLinearStep0To1": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 0,
			  },
			  "pausedLinearStep1ToFinish": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			  },
			}
		`);
	});

	test("advanceStep safety limits transition to error when exceeded", () => {
		// linearWf has 2 steps -> limit is 2 * 5 = 10
		const atBoundaryActive: ExtractWorkflowState<"active"> = {
			status: "active",
			step: 0,
			iterationCount: 9, // next will be 10 === limit -> allowed
		};
		const exceededActive: ExtractWorkflowState<"active"> = {
			status: "active",
			step: 0,
			iterationCount: 10, // next will be 11 > 10 -> exceeded
		};

		const atBoundary = advanceStep(linearWf.flatSteps, atBoundaryActive);
		const limitExceeded = advanceStep(linearWf.flatSteps, exceededActive);

		expect({ atBoundary, limitExceeded }).toMatchInlineSnapshot(`
			{
			  "atBoundary": {
			    "iterationCount": 10,
			    "status": "active",
			    "step": 1,
			  },
			  "limitExceeded": {
			    "error": "Workflow terminated: Exceeded safety iteration limit (10).",
			    "iterationCount": 11,
			    "status": "error",
			    "step": 0,
			  },
			}
		`);
	});

	test("failWorkflow snapshot matrix", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
		};

		const results = {
			failActive: failWorkflow(activeState, "Fatal error"),
			failPaused: failWorkflow(pausedState, "Fatal error"),
			failFinished: failWorkflow(finishedState, "Fatal error"),
			failNull: failWorkflow(null, "Fatal error"),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "failActive": {
			    "error": "Fatal error",
			    "iterationCount": 1,
			    "status": "error",
			    "step": 0,
			  },
			  "failFinished": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			  },
			  "failNull": null,
			  "failPaused": {
			    "error": "Fatal error",
			    "iterationCount": 1,
			    "status": "error",
			    "step": 0,
			  },
			}
		`);
	});

	test("stopWorkflowState snapshot matrix", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
		};

		const results = {
			stopActive: stopWorkflowState(activeState, "LinearFlow"),
			stopPaused: stopWorkflowState(pausedState, "LinearFlow"),
			stopFinished: stopWorkflowState(finishedState, "LinearFlow"),
			stopNull: stopWorkflowState(null, "LinearFlow"),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "stopActive": {
			    "state": {
			      "iterationCount": 1,
			      "status": "finished",
			      "step": 0,
			    },
			    "wasRunning": true,
			    "workflowName": "LinearFlow",
			  },
			  "stopFinished": {
			    "state": null,
			    "wasRunning": false,
			  },
			  "stopNull": {
			    "state": null,
			    "wasRunning": false,
			  },
			  "stopPaused": {
			    "state": {
			      "iterationCount": 1,
			      "status": "finished",
			      "step": 0,
			    },
			    "wasRunning": true,
			    "workflowName": "LinearFlow",
			  },
			}
		`);
	});

	test("advanceStep snapshot matrix for gate step transitions", () => {
		const activeAtGate: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 1,
		};

		const pausedAtGate: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
		};

		const activeAtLastGate: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 1,
		};

		const assertions = {
			activeGateStepAdvancesToPaused: advanceStep(
				gateWf.flatSteps,
				activeAtGate,
			),
			pausedGateStepAdvancesToPaused: advanceStep(
				gateWf.flatSteps,
				pausedAtGate,
			),
			lastGateStepAdvancesToPaused: advanceStep(
				gateAsLastStepWf.flatSteps,
				activeAtLastGate,
			),
		};

		expect(assertions).toMatchInlineSnapshot(`
			{
			  "activeGateStepAdvancesToPaused": {
			    "iterationCount": 2,
			    "status": "paused",
			    "step": 1,
			  },
			  "lastGateStepAdvancesToPaused": {
			    "iterationCount": 2,
			    "status": "paused",
			    "step": 1,
			  },
			  "pausedGateStepAdvancesToPaused": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			  },
			}
		`);
	});
});
