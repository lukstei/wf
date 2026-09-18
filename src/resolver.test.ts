import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { defaultWorkflowResolver, resolveWorkflowPath } from "./resolver.ts";
import { stripAbsolutePath } from "./test-utils.ts";

describe("resolver.ts", () => {
	test("resolveWorkflowPath handles mentions, quotes, and extensionless candidate paths", () => {
		const results = [
			resolveWorkflowPath("@[examples/weekend.md]"),
			resolveWorkflowPath("@examples/weekend.md"),
			resolveWorkflowPath('"examples/weekend.md"'),
			resolveWorkflowPath("'examples/weekend.md'"),
			resolveWorkflowPath("examples/weekend"),
			resolveWorkflowPath("nonexistent/file.json"),
		].map((p) => (p ? stripAbsolutePath(p) : null));

		expect(results).toMatchInlineSnapshot(`
			[
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  null,
			]
		`);
	});

	test("resolveWorkflowPath resolves across workspace paths and absolute paths", () => {
		const absPath = path.resolve(process.cwd(), "examples/weekend.md");
		const fromAbs = resolveWorkflowPath(absPath);
		const fromWs = resolveWorkflowPath("weekend.md", [
			path.resolve(process.cwd(), "examples"),
		]);

		expect([
			fromAbs ? stripAbsolutePath(fromAbs) : null,
			fromWs ? stripAbsolutePath(fromWs) : null,
		]).toMatchInlineSnapshot(`
			[
			  "examples/weekend.md",
			  "examples/weekend.md",
			]
		`);
	});

	test("defaultWorkflowResolver resolves and parses markdown and json workflows", () => {
		const jsonRes = defaultWorkflowResolver(
			"fixtures/md-parser/test-01-sample-wf.json",
		);
		const mdRes = defaultWorkflowResolver("examples/weekend.md");

		expect({
			jsonName: jsonRes && "workflow" in jsonRes ? jsonRes.workflow.name : null,
			mdName: mdRes && "workflow" in mdRes ? mdRes.workflow.name : null,
		}).toMatchInlineSnapshot(`
			{
			  "jsonName": "Derive an API client from a recorded session",
			  "mdName": "Weekend Readiness Protocol",
			}
		`);
	});

	test("defaultWorkflowResolver returns error diagnostics on empty, invalid, or nonexistent files", () => {
		const tempDir = path.resolve(process.cwd(), ".test-resolver-tmp");
		fs.mkdirSync(tempDir, { recursive: true });

		const emptyJson = path.join(tempDir, "empty.json");
		const invalidJson = path.join(tempDir, "invalid.json");
		const emptyMd = path.join(tempDir, "empty.md");

		fs.writeFileSync(emptyJson, JSON.stringify({ name: "Empty", steps: [] }));
		fs.writeFileSync(invalidJson, "{ corrupt json");
		fs.writeFileSync(emptyMd, "# Empty Workflow\n\nNo steps here.");

		try {
			const results = [
				defaultWorkflowResolver("missing-file.json"),
				defaultWorkflowResolver(emptyJson),
				defaultWorkflowResolver(invalidJson),
				defaultWorkflowResolver(emptyMd),
			].map((res) => {
				if (!res) return null;
				if ("error" in res) return stripAbsolutePath(res.error);
				return res.workflow.name;
			});

			expect(results).toMatchInlineSnapshot(`
				[
				  null,
				  "Workflow file ".test-resolver-tmp/empty.json" does not contain any steps.",
				  "Failed to parse workflow JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
				  "Workflow file ".test-resolver-tmp/empty.md" does not contain any steps.",
				]
			`);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
