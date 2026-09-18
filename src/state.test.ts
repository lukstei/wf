import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
	getDebugLogPath,
	getStatePath,
	getStorageBaseDir,
	getWorkflowPath,
	loadActiveWorkflow,
	loadState,
	loadWorkflow,
	saveState,
	saveWorkflow,
	type WorkflowState,
} from "./state.ts";
import {
	flattenWorkflow,
	isConditionalStep,
	isGateStep,
	isStep,
	nextStep,
	type WorkflowAst,
	type WorkflowStep,
} from "./workflow.ts";

describe("state.ts", () => {
	test("flattenWorkflow flattens linear actions", () => {
		const wf: WorkflowAst = {
			name: "Linear",
			steps: [
				{ type: "step", title: "Step 1", instruction: "Do step 1" },
				{ type: "step", title: "Step 2", instruction: "Do step 2" },
			],
		};
		const flat = flattenWorkflow(wf.steps);
		expect(flat).toMatchInlineSnapshot(`
      [
        {
          "index": 0,
          "instruction": "Do step 1",
          "level": 0,
          "nextIndex": 1,
          "title": "Step 1",
          "type": "step",
        },
        {
          "index": 1,
          "instruction": "Do step 2",
          "level": 0,
          "nextIndex": 2,
          "title": "Step 2",
          "type": "step",
        },
      ]
    `);
	});

	test("flattenWorkflow compiles single-level condition with yes and no branches", () => {
		const condWf: WorkflowAst = {
			name: "Condition",
			steps: [
				{ type: "step", title: "Init", instruction: "Init" },
				{
					type: "condition",
					title: "is it friday?",
					condition: "is it friday?",
					yes: {
						steps: [{ type: "step", title: "Friday", instruction: "Friday" }],
					},
					no: {
						steps: [{ type: "step", title: "Weekday", instruction: "Weekday" }],
					},
				},
				{ type: "step", title: "Done", instruction: "Done" },
			],
		};
		const flat = flattenWorkflow(condWf.steps);
		expect(flat).toMatchInlineSnapshot(`
      [
        {
          "index": 0,
          "instruction": "Init",
          "level": 0,
          "nextIndex": 1,
          "title": "Init",
          "type": "step",
        },
        {
          "condition": "is it friday?",
          "index": 1,
          "level": 0,
          "nextIndex": 2,
          "skipIndex": 3,
          "title": "is it friday?",
          "type": "condition",
        },
        {
          "index": 2,
          "instruction": "Friday",
          "level": 1,
          "nextIndex": 4,
          "title": "Friday",
          "type": "step",
        },
        {
          "index": 3,
          "instruction": "Weekday",
          "level": 1,
          "nextIndex": 4,
          "title": "Weekday",
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
      ]
    `);
	});

	test("flattenWorkflow compiles nested conditions and sets levels correctly", () => {
		const nestedWf: WorkflowAst = {
			name: "Nested",
			steps: [
				{ type: "step", title: "Init", instruction: "Init" },
				{
					type: "condition",
					title: "is it friday?",
					condition: "is it friday?",
					yes: {
						steps: [
							{
								type: "condition",
								title: "is it afternoon?",
								condition: "is it afternoon?",
								yes: {
									steps: [
										{
											type: "step",
											title: "Early weekend",
											instruction: "Early weekend",
										},
									],
								},
								no: {
									steps: [
										{
											type: "step",
											title: "Wait for 5pm",
											instruction: "Wait for 5pm",
										},
									],
								},
							},
						],
					},
					no: {
						steps: [{ type: "step", title: "Workday", instruction: "Workday" }],
					},
				},
				{ type: "step", title: "Conclude", instruction: "Conclude" },
			],
		};

		const flat = flattenWorkflow(nestedWf.steps);
		expect(flat).toMatchInlineSnapshot(`
      [
        {
          "index": 0,
          "instruction": "Init",
          "level": 0,
          "nextIndex": 1,
          "title": "Init",
          "type": "step",
        },
        {
          "condition": "is it friday?",
          "index": 1,
          "level": 0,
          "nextIndex": 2,
          "skipIndex": 5,
          "title": "is it friday?",
          "type": "condition",
        },
        {
          "condition": "is it afternoon?",
          "index": 2,
          "level": 1,
          "nextIndex": 3,
          "skipIndex": 4,
          "title": "is it afternoon?",
          "type": "condition",
        },
        {
          "index": 3,
          "instruction": "Early weekend",
          "level": 2,
          "nextIndex": 6,
          "title": "Early weekend",
          "type": "step",
        },
        {
          "index": 4,
          "instruction": "Wait for 5pm",
          "level": 2,
          "nextIndex": 6,
          "title": "Wait for 5pm",
          "type": "step",
        },
        {
          "index": 5,
          "instruction": "Workday",
          "level": 1,
          "nextIndex": 6,
          "title": "Workday",
          "type": "step",
        },
        {
          "index": 6,
          "instruction": "Conclude",
          "level": 0,
          "nextIndex": 7,
          "title": "Conclude",
          "type": "step",
        },
      ]
    `);
	});

	test("nextStep() jumps to correct target based on decision and step type", () => {
		const flat = flattenWorkflow([
			{ type: "step", title: "Init", instruction: "Init" },
			{
				type: "condition",
				title: "is it friday?",
				condition: "is it friday?",
				yes: {
					steps: [
						{ type: "step", title: "Yes Friday", instruction: "Yes Friday" },
					],
				},
				no: {
					steps: [
						{ type: "step", title: "No Friday", instruction: "No Friday" },
					],
				},
			},
			{ type: "step", title: "Done", instruction: "Done" },
		]);

		const jumps = {
			"s1 action": nextStep(flat, 0),
			"c1 condition (YES)": nextStep(flat, 1, "YES"),
			"c1 condition (NO)": nextStep(flat, 1, "NO"),
			"y1 action": nextStep(flat, 2),
			"n1 action": nextStep(flat, 3),
			"s3 action": nextStep(flat, 4),
		};
		expect(jumps).toMatchInlineSnapshot(`
      {
        "c1 condition (NO)": 3,
        "c1 condition (YES)": 2,
        "n1 action": 4,
        "s1 action": 1,
        "s3 action": 5,
        "y1 action": 4,
      }
    `);
	});

	test("getStorageBaseDir and path helpers resolve harness and default locations", () => {
		const customEnv = {
			PLUGIN_DATA: "/custom/codex/data",
		};
		expect(getStorageBaseDir(customEnv)).toBe("/custom/codex/data");
		expect(getStatePath("session-1", customEnv)).toBe(
			"/custom/codex/data/session-1/state.json",
		);
		expect(getDebugLogPath("session-1", customEnv)).toBe(
			"/custom/codex/data/session-1/debug.log",
		);
		expect(getDebugLogPath(undefined, customEnv)).toBe(
			"/custom/codex/data/debug.log",
		);

		const claudeEnv = {
			CLAUDE_PLUGIN_DATA: "/custom/claude/data",
		};
		expect(getStorageBaseDir(claudeEnv)).toBe("/custom/claude/data");
		expect(getStatePath("session-2", claudeEnv)).toBe(
			"/custom/claude/data/session-2/state.json",
		);
		expect(getDebugLogPath("session-2", claudeEnv)).toBe(
			"/custom/claude/data/session-2/debug.log",
		);

		const copilotEnv = {
			COPILOT_PLUGIN_DATA: "/custom/copilot/data",
		};
		expect(getStorageBaseDir(copilotEnv)).toBe("/custom/copilot/data");
		expect(getStatePath("session-3", copilotEnv)).toBe(
			"/custom/copilot/data/session-3/state.json",
		);
		expect(getDebugLogPath("session-3", copilotEnv)).toBe(
			"/custom/copilot/data/session-3/debug.log",
		);

		const emptyEnv = {};
		expect(getStorageBaseDir(emptyEnv)).toMatch(/[/\\]wf$/);
		expect(getStatePath("session-4", emptyEnv)).toMatch(
			/[/\\]wf[/\\]session-4[/\\]state\.json$/,
		);
		expect(getDebugLogPath("session-4", emptyEnv)).toMatch(
			/[/\\]wf[/\\]session-4[/\\]debug\.log$/,
		);
		expect(getDebugLogPath(undefined, emptyEnv)).toMatch(
			/[/\\]wf[/\\]debug\.log$/,
		);
	});

	test("loadState and saveState persist state to disk", () => {
		const testConvId = `test-conv-${Date.now()}`;
		const empty = loadState(testConvId);
		expect(empty).toBeNull();

		const sampleState: WorkflowState = {
			status: "active",
			step: 1,
			iterationCount: 1,
		};

		saveState(testConvId, sampleState);
		const loaded = loadState(testConvId);
		expect(loaded).toEqual(sampleState);

		const sampleWorkflow = {
			name: "TestFlow",
			filePath: "/mock/path.json",
			steps: [],
			flatSteps: [],
		};
		saveWorkflow(testConvId, sampleWorkflow);
		const loadedWf = loadWorkflow(testConvId);
		expect(loadedWf).toEqual(sampleWorkflow);

		const loadedActive = loadActiveWorkflow(testConvId);
		expect(loadedActive).toEqual({
			state: sampleState,
			workflow: sampleWorkflow,
		});

		// Corrupted JSON returns null
		fs.writeFileSync(getStatePath(testConvId), "{ corrupt json", "utf-8");
		expect(loadState(testConvId)).toBeNull();
		expect(loadActiveWorkflow(testConvId)).toBeNull();

		// Clean up
		try {
			fs.rmSync(path.dirname(getStatePath(testConvId)), {
				recursive: true,
				force: true,
			});
		} catch {}
	});

	test("step type guards enforce strict typing without backwards compatibility", () => {
		const assertions = [
			{
				input: { type: "step", title: "Do", instruction: "Do" },
				isStep: isStep({ type: "step", title: "Do", instruction: "Do" }),
			},
			{
				input: { type: "gate", title: "Wait", instruction: "Wait" },
				isStep: isStep({ type: "gate", title: "Wait", instruction: "Wait" }),
			},
			{
				input: {
					type: "condition",
					title: "Ready?",
					condition: "Ready?",
					yes: { steps: [] },
				},
				isStep: isStep({
					type: "condition",
					title: "Ready?",
					condition: "Ready?",
					yes: { steps: [] },
				}),
			},
			{
				input: { instruction: "Do without type" },
				isStep: isStep({
					instruction: "Do without type",
				} as unknown as WorkflowStep),
			},
			{
				input: { type: "action", instruction: "Do action" },
				isStep: isStep({
					type: "action",
					instruction: "Do action",
				} as unknown as WorkflowStep),
			},
			{
				input: { type: "gate", title: "Wait", instruction: "Wait" },
				isGateStep: isGateStep({
					type: "gate",
					title: "Wait",
					instruction: "Wait",
				}),
			},
			{
				input: { type: "step", title: "Do", instruction: "Do" },
				isGateStep: isGateStep({
					type: "step",
					title: "Do",
					instruction: "Do",
				}),
			},
			{
				input: {
					type: "condition",
					title: "Ready?",
					condition: "Ready?",
					yes: { steps: [] },
				},
				isConditionalStep: isConditionalStep({
					type: "condition",
					title: "Ready?",
					condition: "Ready?",
					yes: { steps: [] },
				}),
			},
			{
				input: { type: "step", title: "Do", instruction: "Do" },
				isConditionalStep: isConditionalStep({
					type: "step",
					title: "Do",
					instruction: "Do",
				}),
			},
		];
		expect(assertions).toMatchInlineSnapshot(`
      [
        {
          "input": {
            "instruction": "Do",
            "title": "Do",
            "type": "step",
          },
          "isStep": true,
        },
        {
          "input": {
            "instruction": "Wait",
            "title": "Wait",
            "type": "gate",
          },
          "isStep": false,
        },
        {
          "input": {
            "condition": "Ready?",
            "title": "Ready?",
            "type": "condition",
            "yes": {
              "steps": [],
            },
          },
          "isStep": false,
        },
        {
          "input": {
            "instruction": "Do without type",
          },
          "isStep": false,
        },
        {
          "input": {
            "instruction": "Do action",
            "type": "action",
          },
          "isStep": false,
        },
        {
          "input": {
            "instruction": "Wait",
            "title": "Wait",
            "type": "gate",
          },
          "isGateStep": true,
        },
        {
          "input": {
            "instruction": "Do",
            "title": "Do",
            "type": "step",
          },
          "isGateStep": false,
        },
        {
          "input": {
            "condition": "Ready?",
            "title": "Ready?",
            "type": "condition",
            "yes": {
              "steps": [],
            },
          },
          "isConditionalStep": true,
        },
        {
          "input": {
            "instruction": "Do",
            "title": "Do",
            "type": "step",
          },
          "isConditionalStep": false,
        },
      ]
    `);
	});
});
