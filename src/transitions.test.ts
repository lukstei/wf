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
import { flattenWorkflow, type WorkflowInfo } from "./workflow.ts";

describe("transitions.ts", () => {
	const linearWf: WorkflowInfo = {
		name: "LinearFlow",
		filePath: "/test/linear.json",
		flatSteps: flattenWorkflow([
			{ type: "step", title: "First step", instruction: "First step" },
			{ type: "step", title: "Second step", instruction: "Second step" },
		]),
	};

	const condWf: WorkflowInfo = {
		name: "CondFlow",
		filePath: "/test/cond.json",
		flatSteps: flattenWorkflow([
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
		]),
	};

	test("startWorkflow initializes active workflow state", () => {
		const activeState = startWorkflow(linearWf);

		expect(activeState).toMatchInlineSnapshot(`
			{
			  "iterationCount": 0,
			  "status": "active",
			  "step": 0,
			  "workflow": {
			    "filePath": "/test/linear.json",
			    "flatSteps": [
			      {
			        "index": 0,
			        "instruction": "First step",
			        "level": 0,
			        "nextIndex": 1,
			        "title": "First step",
			        "type": "step",
			      },
			      {
			        "index": 1,
			        "instruction": "Second step",
			        "level": 0,
			        "nextIndex": 2,
			        "title": "Second step",
			        "type": "step",
			      },
			    ],
			    "name": "LinearFlow",
			  },
			}
		`);

		expect(() =>
			startWorkflow({
				name: "Empty",
				filePath: "/empty.json",
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
			workflow: linearWf,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
			workflow: linearWf,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
			workflow: linearWf,
		};
		const errorState: WorkflowState = {
			status: "error",
			error: "Something failed",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
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
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "fromError": {
			    "error": "Something failed",
			    "iterationCount": 1,
			    "status": "error",
			    "step": 0,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "fromFinished": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "fromNull": null,
			  "fromPaused": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			}
		`);
	});

	test("resumeWorkflow snapshot matrix and precondition assertions", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
			workflow: linearWf,
		};
		const errorState: WorkflowState = {
			status: "error",
			error: "Boom",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};

		const results = {
			fromActive: resumeWorkflow(activeState),
			fromPaused: resumeWorkflow(pausedState),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "fromActive": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 0,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "fromPaused": {
			    "iterationCount": 1,
			    "status": "active",
			    "step": 0,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			}
		`);

		expect(() => resumeWorkflow(finishedState)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
		expect(() => resumeWorkflow(errorState)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
		expect(() => resumeWorkflow(null)).toThrow(
			"Cannot resume workflow: no active or paused workflow is loaded",
		);
	});

	test("advanceStep snapshot matrix for linear and conditional progressions", () => {
		const activeLinear0: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const pausedLinear0: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const activeLinear1: WorkflowState = {
			status: "active",
			step: 1, // last step
			iterationCount: 1,
			workflow: linearWf,
		};
		const pausedLinear1: WorkflowState = {
			status: "paused",
			step: 1, // last step
			iterationCount: 1,
			workflow: linearWf,
		};

		const activeCond1: WorkflowState = {
			status: "active",
			step: 1, // condition c1
			iterationCount: 1,
			workflow: condWf,
		};

		const advanceAssertions = {
			activeLinearStep0To1: advanceStep(activeLinear0),
			pausedLinearStep0To1: advanceStep(pausedLinear0),
			activeLinearStep1ToFinish: advanceStep(activeLinear1),
			pausedLinearStep1ToFinish: advanceStep(pausedLinear1),
			conditionBranchYes: advanceStep(activeCond1, "YES"),
			conditionBranchNo: advanceStep(activeCond1, "NO"),
			nullStateUnchanged: advanceStep(null),
		};

		expect(advanceAssertions).toMatchInlineSnapshot(`
			{
			  "activeLinearStep0To1": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 1,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "activeLinearStep1ToFinish": {
			    "iterationCount": 2,
			    "status": "finished",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "conditionBranchNo": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 3,
			    "workflow": {
			      "filePath": "/test/cond.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "Init",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "Init",
			          "type": "step",
			        },
			        {
			          "condition": "is ready?",
			          "index": 1,
			          "level": 0,
			          "nextIndex": 2,
			          "skipIndex": 3,
			          "title": "is ready?",
			          "type": "condition",
			        },
			        {
			          "index": 2,
			          "instruction": "Deploy",
			          "level": 1,
			          "nextIndex": 4,
			          "title": "Deploy",
			          "type": "step",
			        },
			        {
			          "index": 3,
			          "instruction": "Fix",
			          "level": 1,
			          "nextIndex": 4,
			          "title": "Fix",
			          "type": "step",
			        },
			        {
			          "index": 4,
			          "instruction": "Done",
			          "level": 0,
			          "nextIndex": 5,
			          "title": "Done",
			          "type": "step",
			        },
			      ],
			      "name": "CondFlow",
			    },
			  },
			  "conditionBranchYes": {
			    "iterationCount": 2,
			    "status": "active",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/cond.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "Init",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "Init",
			          "type": "step",
			        },
			        {
			          "condition": "is ready?",
			          "index": 1,
			          "level": 0,
			          "nextIndex": 2,
			          "skipIndex": 3,
			          "title": "is ready?",
			          "type": "condition",
			        },
			        {
			          "index": 2,
			          "instruction": "Deploy",
			          "level": 1,
			          "nextIndex": 4,
			          "title": "Deploy",
			          "type": "step",
			        },
			        {
			          "index": 3,
			          "instruction": "Fix",
			          "level": 1,
			          "nextIndex": 4,
			          "title": "Fix",
			          "type": "step",
			        },
			        {
			          "index": 4,
			          "instruction": "Done",
			          "level": 0,
			          "nextIndex": 5,
			          "title": "Done",
			          "type": "step",
			        },
			      ],
			      "name": "CondFlow",
			    },
			  },
			  "nullStateUnchanged": null,
			  "pausedLinearStep0To1": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 0,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "pausedLinearStep1ToFinish": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			}
		`);
	});

	test("advanceStep safety limits transition to error when exceeded", () => {
		// linearWf has 2 steps -> limit is 2 * 5 = 10
		const atBoundaryActive: ExtractWorkflowState<"active"> = {
			status: "active",
			step: 0,
			workflow: linearWf,
			iterationCount: 9, // next will be 10 === limit -> allowed
		};
		const exceededActive: ExtractWorkflowState<"active"> = {
			status: "active",
			step: 0,
			workflow: linearWf,
			iterationCount: 10, // next will be 11 > 10 -> exceeded
		};

		const atBoundary = advanceStep(atBoundaryActive);
		const limitExceeded = advanceStep(exceededActive);

		expect(atBoundary?.status).toBe("active");
		expect(atBoundary?.iterationCount).toBe(10);
		expect(limitExceeded?.status).toBe("error");
		if (limitExceeded?.status === "error") {
			expect(limitExceeded.error).toBe(
				"Workflow terminated: Exceeded safety iteration limit (10).",
			);
			expect(limitExceeded.iterationCount).toBe(11);
		}
	});

	test("failWorkflow snapshot matrix", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
			workflow: linearWf,
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
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "failFinished": {
			    "iterationCount": 1,
			    "status": "finished",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			  "failNull": null,
			  "failPaused": {
			    "error": "Fatal error",
			    "iterationCount": 1,
			    "status": "error",
			    "step": 0,
			    "workflow": {
			      "filePath": "/test/linear.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Second step",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Second step",
			          "type": "step",
			        },
			      ],
			      "name": "LinearFlow",
			    },
			  },
			}
		`);
	});

	test("stopWorkflowState snapshot matrix", () => {
		const activeState: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const pausedState: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 1,
			workflow: linearWf,
		};
		const finishedState: WorkflowState = {
			status: "finished",
			step: 2,
			iterationCount: 1,
			workflow: linearWf,
		};

		const results = {
			stopActive: stopWorkflowState(activeState),
			stopPaused: stopWorkflowState(pausedState),
			stopFinished: stopWorkflowState(finishedState),
			stopNull: stopWorkflowState(null),
		};

		expect(results).toMatchInlineSnapshot(`
			{
			  "stopActive": {
			    "state": {
			      "iterationCount": 1,
			      "status": "finished",
			      "step": 0,
			      "workflow": {
			        "filePath": "/test/linear.json",
			        "flatSteps": [
			          {
			            "index": 0,
			            "instruction": "First step",
			            "level": 0,
			            "nextIndex": 1,
			            "title": "First step",
			            "type": "step",
			          },
			          {
			            "index": 1,
			            "instruction": "Second step",
			            "level": 0,
			            "nextIndex": 2,
			            "title": "Second step",
			            "type": "step",
			          },
			        ],
			        "name": "LinearFlow",
			      },
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
			      "workflow": {
			        "filePath": "/test/linear.json",
			        "flatSteps": [
			          {
			            "index": 0,
			            "instruction": "First step",
			            "level": 0,
			            "nextIndex": 1,
			            "title": "First step",
			            "type": "step",
			          },
			          {
			            "index": 1,
			            "instruction": "Second step",
			            "level": 0,
			            "nextIndex": 2,
			            "title": "Second step",
			            "type": "step",
			          },
			        ],
			        "name": "LinearFlow",
			      },
			    },
			    "wasRunning": true,
			    "workflowName": "LinearFlow",
			  },
			}
		`);
	});

	test("advanceStep snapshot matrix for gate step transitions", () => {
		const gateWf: WorkflowInfo = {
			name: "GateFlow",
			filePath: "/test/gate.json",
			flatSteps: flattenWorkflow([
				{ type: "step", title: "First step", instruction: "First step" },
				{ type: "gate", title: "Gate Check", instruction: "Verify" },
				{ type: "step", title: "Final step", instruction: "Final step" },
			]),
		};

		const activeAtGate: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 1,
			workflow: gateWf,
		};

		const pausedAtGate: WorkflowState = {
			status: "paused",
			step: 1,
			iterationCount: 1,
			workflow: gateWf,
		};

		const gateAsLastStepWf: WorkflowInfo = {
			name: "GateLastFlow",
			filePath: "/test/gate-last.json",
			flatSteps: flattenWorkflow([
				{ type: "step", title: "First step", instruction: "First step" },
				{ type: "gate", title: "Final Gate Check", instruction: "Verify last" },
			]),
		};

		const activeAtLastGate: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 1,
			workflow: gateAsLastStepWf,
		};

		const assertions = {
			activeGateStepAdvancesToPaused: advanceStep(activeAtGate),
			pausedGateStepAdvancesToPaused: advanceStep(pausedAtGate),
			lastGateStepAdvancesToFinished: advanceStep(activeAtLastGate),
		};

		expect(assertions).toMatchInlineSnapshot(`
			{
			  "activeGateStepAdvancesToPaused": {
			    "iterationCount": 2,
			    "status": "paused",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/gate.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Verify",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Gate Check",
			          "type": "gate",
			        },
			        {
			          "index": 2,
			          "instruction": "Final step",
			          "level": 0,
			          "nextIndex": 3,
			          "title": "Final step",
			          "type": "step",
			        },
			      ],
			      "name": "GateFlow",
			    },
			  },
			  "lastGateStepAdvancesToFinished": {
			    "iterationCount": 2,
			    "status": "finished",
			    "step": 2,
			    "workflow": {
			      "filePath": "/test/gate-last.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Verify last",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Final Gate Check",
			          "type": "gate",
			        },
			      ],
			      "name": "GateLastFlow",
			    },
			  },
			  "pausedGateStepAdvancesToPaused": {
			    "iterationCount": 1,
			    "status": "paused",
			    "step": 1,
			    "workflow": {
			      "filePath": "/test/gate.json",
			      "flatSteps": [
			        {
			          "index": 0,
			          "instruction": "First step",
			          "level": 0,
			          "nextIndex": 1,
			          "title": "First step",
			          "type": "step",
			        },
			        {
			          "index": 1,
			          "instruction": "Verify",
			          "level": 0,
			          "nextIndex": 2,
			          "title": "Gate Check",
			          "type": "gate",
			        },
			        {
			          "index": 2,
			          "instruction": "Final step",
			          "level": 0,
			          "nextIndex": 3,
			          "title": "Final step",
			          "type": "step",
			        },
			      ],
			      "name": "GateFlow",
			    },
			  },
			}
		`);
	});
});
