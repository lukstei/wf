import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
	OVERRIDE_HEADER,
	injectSystemMessage,
} from "../actions/formatters.ts";
import { defaultWorkflowResolver, resolveWorkflowPath } from "../resolver.ts";
import { getLatestMessage } from "./getLatestMessage.ts";
import { logDebug } from "./logDebug.ts";

describe("util library functions", () => {
	test("getLatestMessage extracts latest USER_INPUT and PLANNER_RESPONSE while skipping GENERIC tool outputs", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-util-"));
		const transcriptPath = path.join(tmpDir, "transcript.jsonl");

		const lines = [
			JSON.stringify({
				step_index: 0,
				source: "USER_EXPLICIT",
				type: "USER_INPUT",
				content: "/wf run test.json",
			}),
			JSON.stringify({
				step_index: 1,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				content: "I will run the command.",
			}),
			JSON.stringify({
				step_index: 2,
				source: "MODEL",
				type: "GENERIC",
				content: "Tool output text...",
			}),
			JSON.stringify({
				step_index: 3,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				content: "Decision [DECISION: YES]",
			}),
		];

		fs.writeFileSync(transcriptPath, lines.join("\n"), "utf-8");

		const msg = getLatestMessage(transcriptPath);
		expect(msg).toBeDefined();
		expect(msg?.stepIndex).toBe(3);
		expect(msg?.type).toBe("PLANNER_RESPONSE");
		expect(msg?.content).toBe("Decision [DECISION: YES]");

		// Append user input
		fs.appendFileSync(
			transcriptPath,
			"\n" +
				JSON.stringify({
					step_index: 4,
					source: "USER_EXPLICIT",
					type: "USER_INPUT",
					content: "/wf next",
				}),
		);

		const nextMsg = getLatestMessage(transcriptPath);
		expect(nextMsg).toBeDefined();
		expect(nextMsg?.stepIndex).toBe(4);
		expect(nextMsg?.type).toBe("USER_INPUT");
		expect(nextMsg?.content).toBe("/wf next");

		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("getLatestMessage returns null on missing or empty transcript", () => {
		expect(getLatestMessage(undefined)).toBeNull();
		expect(getLatestMessage("/non/existent/path/transcript.jsonl")).toBeNull();

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-empty-"));
		const emptyFile = path.join(tmpDir, "empty.jsonl");
		fs.writeFileSync(emptyFile, "", "utf-8");
		expect(getLatestMessage(emptyFile)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("resolveWorkflowPath and defaultWorkflowResolver find workflow files and handle errors", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-resolver-"));
		const validWfPath = path.join(tmpDir, "flow.json");
		fs.writeFileSync(
			validWfPath,
			JSON.stringify({
				name: "ResolvedFlow",
				steps: [{ id: "s1", instruction: "Do" }],
			}),
			"utf-8",
		);

		// Absolute path resolution
		const resolvedDirect = defaultWorkflowResolver(validWfPath);
		expect(resolvedDirect).not.toBeNull();
		if (resolvedDirect && !("error" in resolvedDirect)) {
			expect(resolvedDirect.workflow.name).toBe("ResolvedFlow");
		}

		// Relative to workspace
		const resolvedWorkspace = defaultWorkflowResolver("flow.json", [tmpDir]);
		expect(resolvedWorkspace).not.toBeNull();
		if (resolvedWorkspace && !("error" in resolvedWorkspace)) {
			expect(resolvedWorkspace.filePath).toBe(validWfPath);
		}

		// Mention and quote formats in resolveWorkflowPath
		expect(resolveWorkflowPath("@[flow.json]", [tmpDir])).toBe(validWfPath);
		expect(resolveWorkflowPath("@flow.json", [tmpDir])).toBe(validWfPath);
		expect(resolveWorkflowPath('"flow.json"', [tmpDir])).toBe(validWfPath);
		expect(resolveWorkflowPath("'flow.json'", [tmpDir])).toBe(validWfPath);
		expect(resolveWorkflowPath('@"flow.json"', [tmpDir])).toBe(validWfPath);
		expect(resolveWorkflowPath("@'flow.json'", [tmpDir])).toBe(validWfPath);

		// Missing file
		const missing = defaultWorkflowResolver("missing.json", [tmpDir]);
		expect(missing).toBeNull();

		// Syntax error JSON
		const badPath = path.join(tmpDir, "bad.json");
		fs.writeFileSync(badPath, "{ invalid json", "utf-8");
		const badRes = defaultWorkflowResolver(badPath);
		expect(badRes).not.toBeNull();
		if (badRes && "error" in badRes) {
			expect(badRes.error).toMatch(/Failed to parse workflow JSON/);
		}

		// Markdown workflow resolving
		const mdWfPath = path.join(tmpDir, "flow2.md");
		fs.writeFileSync(mdWfPath, "# MD Workflow\n\n## Step 1\nRun test", "utf-8");

		// Resolve with extension
		const resolvedMd = defaultWorkflowResolver("flow2.md", [tmpDir]);
		expect(resolvedMd).not.toBeNull();
		if (resolvedMd && !("error" in resolvedMd)) {
			expect(resolvedMd.workflow.name).toBe("MD Workflow");
			expect(resolvedMd.workflow.steps).toHaveLength(1);
		}

		// Resolve without extension (auto detects .md)
		const resolvedNoExt = resolveWorkflowPath("flow2", [tmpDir]);
		expect(resolvedNoExt).toBe(mdWfPath);

		// Case-insensitive .MD and .markdown resolving
		const upperMdPath = path.join(tmpDir, "flow3.MD");
		fs.writeFileSync(upperMdPath, "# Upper MD\n\n## Step 1\nRun test", "utf-8");
		const resolvedUpper = defaultWorkflowResolver("flow3.MD", [tmpDir]);
		if (resolvedUpper && !("error" in resolvedUpper)) {
			expect(resolvedUpper.workflow.name).toBe("Upper MD");
		}

		const markdownPath = path.join(tmpDir, "flow4.markdown");
		fs.writeFileSync(
			markdownPath,
			"# Markdown Ext\n\n## Step 1\nRun test",
			"utf-8",
		);
		const resolvedMarkdown = defaultWorkflowResolver("flow4.markdown", [
			tmpDir,
		]);
		if (resolvedMarkdown && !("error" in resolvedMarkdown)) {
			expect(resolvedMarkdown.workflow.name).toBe("Markdown Ext");
		}

		// Empty markdown file error
		const emptyMdPath = path.join(tmpDir, "empty.md");
		fs.writeFileSync(emptyMdPath, "# Empty Workflow\n\nNo steps here", "utf-8");
		const emptyRes = defaultWorkflowResolver(emptyMdPath);
		expect(emptyRes).not.toBeNull();
		if (emptyRes && "error" in emptyRes) {
			expect(emptyRes.error).toMatch(/does not contain any steps/);
		}

		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("logDebug is disabled in unit tests by default", () => {
		const tmpLog = "/tmp/wf-debug.log";
		const sizeBefore = fs.existsSync(tmpLog) ? fs.statSync(tmpLog).size : 0;
		expect(() => {
			logDebug("Test debug message", { sample: 123 });
		}).not.toThrow();
		const sizeAfter = fs.existsSync(tmpLog) ? fs.statSync(tmpLog).size : 0;
		expect(sizeAfter).toBe(sizeBefore);
	});

	test("injectSystemMessage creates standard ephemeral injectSteps payload", () => {
		const res = injectSystemMessage("Hello from system");
		expect(res).toEqual({
			injectSteps: [
				{
					ephemeralMessage: `${OVERRIDE_HEADER}\n\nHello from system`,
				},
			],
		});
	});
});
