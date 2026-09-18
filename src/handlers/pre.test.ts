import { describe, expect, test } from "vitest";
import type { WorkflowState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { flattenWorkflow, type WorkflowDef } from "../workflow.ts";
import { handlePre } from "./pre.ts";

const sampleDef: WorkflowDef = {
	name: "Sample",
	steps: [
		{ type: "step", title: "First Step", instruction: "Do the first thing" },
		{
			type: "condition",
			title: "is ready?",
			condition: "is ready?",
			yes: {
				steps: [{ type: "step", title: "Deploy", instruction: "Deploy" }],
			},
			no: { steps: [{ type: "step", title: "Fix", instruction: "Fix" }] },
		},
	],
};

const mockResolver = () => ({ filePath: "/mock.json", workflow: sampleDef });

describe("handlers/pre.ts", () => {
	test("handlePre starts workflow on /wf <file>", () => {
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: {
				stepIndex: 1,
				type: "USER_INPUT",
				content: "/wf test.json",
			},
			workflowResolver: mockResolver,
		};
		const { state: nextState, response } = handlePre(info, null);
		expect(nextState?.status).toBe("active");
		expect(nextState?.step).toBe(0);
		expect(response.injectSteps).toBeDefined();
		expect(response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Do the first thing/,
		);
	});

	test("handlePre pauses active workflow on user conversational interruption", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: {
				stepIndex: 2,
				type: "USER_INPUT",
				content: "Stop and tell me a joke",
			},
		};
		const state: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 0,
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
		};
		const { state: nextState, response } = handlePre(info, state);
		expect(nextState?.status).toBe("paused");
		expect(response).toEqual({});
	});

	test("handlePre executes /wf-next when paused", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
			latestMessage: { stepIndex: 2, type: "USER_INPUT", content: "/wf-next" },
		};
		const state: WorkflowState = {
			status: "paused",
			step: 0,
			iterationCount: 0,
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
		};
		const { state: nextState, response } = handlePre(info, state);
		expect(nextState?.status).toBe("active");
		expect(response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Do the first thing/,
		);
	});

	test("handlePre executes /wf-show, /wf-help, and /wf-stop", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const initial: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 1,
			workflow: { name: "Sample", filePath: "/mock.json", flatSteps: flat },
		};
		const showNoArgRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 2,
					type: "USER_INPUT",
					content: "/wf-show",
				},
			},
			initial,
		);
		expect(showNoArgRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/WORKFLOW STATUS: PAUSED/,
		);
		expect(showNoArgRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/WORKFLOW VISUALIZATION/,
		);
		expect(showNoArgRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/style s0 stroke:#3b82f6,stroke-width:4px/,
		);
		expect(showNoArgRes.state).toEqual({ ...initial, status: "paused" });

		const stopRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 3,
					type: "USER_INPUT",
					content: "/wf-stop",
				},
			},
			initial,
		);
		expect(stopRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow "Sample" has been stopped\./,
		);
		expect(stopRes.state?.status).toBe("finished");

		const helpRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 4,
					type: "USER_INPUT",
					content: "/wf-help",
				},
			},
			null,
		);
		expect(helpRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Workflow Runner Commands/,
		);
		expect(helpRes.state).toBeNull();

		const showRes = handlePre(
			{
				type: "pre",
				payload: { conversationId: "c1" },
				latestMessage: {
					stepIndex: 5,
					type: "USER_INPUT",
					content: "/wf-show test.json",
				},
				workflowResolver: mockResolver,
			},
			initial,
		);
		expect(showRes.response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/\[WORKFLOW VISUALIZATION: Sample\]/,
		);
		expect(showRes.state).toEqual({ ...initial, status: "paused" });
	});

	test("handlePre terminates on runaway loop iteration limit", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
		};
		// flat has 4 steps, limit is 4 * 5 = 20
		const state: WorkflowState = {
			status: "active",
			step: 0,
			iterationCount: 20, // limit is 20, next iteration will be 21 -> exceeded
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
		};

		const { state: nextState, response } = handlePre(info, state);
		expect(nextState?.status).toBe("error");
		expect(response.injectSteps?.[0]?.ephemeralMessage).toMatch(
			/Exceeded safety iteration limit/,
		);
	});

	test("handlePre injects condition evaluation prompt on condition step", () => {
		const flat = flattenWorkflow(sampleDef.steps);
		const info: HookInfo = {
			type: "pre",
			payload: { conversationId: "c1" },
		};
		const state: WorkflowState = {
			status: "active",
			step: 1, // c1 condition
			iterationCount: 0,
			workflow: { name: "Sample", filePath: "wf.json", flatSteps: flat },
		};
		const { state: nextState, response } = handlePre(info, state);
		expect(nextState?.status).toBe("active");
		expect(nextState?.step).toBe(1);
		expect(nextState?.iterationCount).toBe(0);

		const msg = response.injectSteps?.[0]?.ephemeralMessage;
		expect(msg).toMatch(/Condition Evaluation/);
		expect(msg).toMatch(/Condition: "is ready\?"/);
	});
});
