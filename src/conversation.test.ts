import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { defaultWorkflowResolver } from "./resolver.ts";
import type { WorkflowState } from "./state.ts";
import { stripAbsolutePath } from "./test-utils.ts";
import type { LatestMessage } from "./types.ts";
import { handle } from "./wf.ts";
import type { WorkflowDef } from "./workflow.ts";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const fixturesDir = path.resolve(
	import.meta.dirname,
	"../fixtures/conversations",
);

interface ConversationMessage {
	step_index?: number;
	stepIndex?: number;
	source?: string;
	type?: string;
	status?: string;
	content: string;
	terminationReason?: string;
}

interface StepExpectation {
	output?: Record<string, unknown>;
	state?: Record<string, unknown> | null;
}

interface ConversationStep {
	id?: string;
	input?: ConversationMessage;
	expectedPre?: StepExpectation;
	model?: ConversationMessage;
	expectedStop?: StepExpectation;
}

interface ConversationFile {
	name: string;
	description?: string;
	workflow?: WorkflowDef;
	steps: ConversationStep[];
}

/**
 * Normalizes state for portable assertions across environments,
 * omitting the static workflow definition.
 */
function sanitizeState(
	state: WorkflowState | null,
): Record<string, unknown> | null {
	if (!state) return null;
	const { workflow, ...rest } = state;
	return rest;
}

function sanitizeOutput(
	output: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!output) return output;
	const json = JSON.stringify(output);
	const normalized = stripAbsolutePath(json, workspaceRoot);
	return JSON.parse(normalized);
}

function toLatestMessage(
	msg: ConversationMessage,
	defaultType: "USER_INPUT" | "PLANNER_RESPONSE",
): LatestMessage {
	return {
		stepIndex:
			typeof msg.step_index === "number"
				? msg.step_index
				: (msg.stepIndex ?? 0),
		type: msg.type || defaultType,
		source: msg.source,
		content: msg.content,
	};
}

describe("Conversation Integration Tests", () => {
	const files = fs
		.readdirSync(fixturesDir)
		.filter((f) => f.endsWith(".json"))
		.sort();

	for (const file of files) {
		const filePath = path.join(fixturesDir, file);
		const conversation: ConversationFile = JSON.parse(
			fs.readFileSync(filePath, "utf-8"),
		);

		describe(`Conversation: ${conversation.name || file}`, () => {
			let state: WorkflowState | null = null;
			const conversationId = `conv-${conversation.name || path.basename(file, ".json")}`;

			const resolver = (targetPath: string) => {
				if (conversation.workflow) {
					return {
						filePath: targetPath || `${conversation.name}.json`,
						workflow: conversation.workflow,
					};
				}
				return defaultWorkflowResolver(targetPath, [workspaceRoot]);
			};

			for (let i = 0; i < conversation.steps.length; i++) {
				const step = conversation.steps[i];
				const stepLabel = step.id || `step-${i + 1}`;

				test(stepLabel, () => {
					// 1. PreInvocation hook
					const preInfo = {
						type: "pre" as const,
						payload: { conversationId, workspacePaths: [workspaceRoot] },
						workflowResolver: resolver,
						latestMessage: step.input
							? toLatestMessage(step.input, "USER_INPUT")
							: undefined,
					};

					const preRes = handle(preInfo, state);
					state = preRes.state;

					if (step.expectedPre) {
						expect(sanitizeOutput(preRes.response)).toEqual(
							step.expectedPre.output,
						);
						expect(sanitizeState(preRes.state)).toEqual(step.expectedPre.state);
					}

					// 2. Stop hook (if step has a model response)
					if (step.model) {
						const stopInfo = {
							type: "stop" as const,
							payload: {
								conversationId,
								terminationReason:
									step.model.terminationReason || "NO_TOOL_CALL",
							},
							workflowResolver: resolver,
							latestMessage: toLatestMessage(step.model, "PLANNER_RESPONSE"),
						};

						const stopRes = handle(stopInfo, state);
						state = stopRes.state;

						if (step.expectedStop) {
							expect(sanitizeOutput(stopRes.response)).toEqual(
								step.expectedStop.output,
							);
							expect(sanitizeState(stopRes.state)).toEqual(
								step.expectedStop.state,
							);
						}
					}
				});
			}
		});
	}
});
