import * as fs from "node:fs";
import * as path from "node:path";
import { parseWorkflowMarkdown } from "./lib/markdown/wf.ts";
import type { WorkflowDef } from "./workflow.ts";

export function resolveWorkflowPath(
	userPath: string,
	workspacePaths?: string[],
): string | null {
	let cleanPath = userPath.trim();
	const bracketMatch = cleanPath.match(/^@\[([^\]]+)\]$/);
	if (bracketMatch) {
		cleanPath = bracketMatch[1].trim();
	} else {
		if (cleanPath.startsWith("@")) {
			cleanPath = cleanPath.slice(1).trim();
		}
		const quoteMatch = cleanPath.match(/^["']([^"']+)["']$/);
		if (quoteMatch) {
			cleanPath = quoteMatch[1].trim();
		}
	}

	function checkCandidate(candidatePath: string): string | null {
		try {
			if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
				return candidatePath;
			}
			if (!path.extname(candidatePath)) {
				for (const ext of [".md", ".markdown", ".json"]) {
					const candidate = candidatePath + ext;
					if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
						return candidate;
					}
				}
			}
		} catch {
			// Ignore fs errors
		}
		return null;
	}

	if (path.isAbsolute(cleanPath)) {
		const found = checkCandidate(cleanPath);
		if (found) return found;
	}

	if (workspacePaths && workspacePaths.length > 0) {
		for (const ws of workspacePaths) {
			const resolved = checkCandidate(path.resolve(ws, cleanPath));
			if (resolved) return resolved;
		}
	}

	const cwdResolved = checkCandidate(path.resolve(process.cwd(), cleanPath));
	if (cwdResolved) return cwdResolved;

	return null;
}

export function defaultWorkflowResolver(
	targetPath: string,
	workspacePaths?: string[],
): { filePath: string; workflow: WorkflowDef } | { error: string } | null {
	const resolved = resolveWorkflowPath(targetPath, workspacePaths);
	if (!resolved) return null;

	try {
		const content = fs.readFileSync(resolved, "utf-8");
		if (/\.(md|markdown)$/i.test(resolved)) {
			try {
				const parsed = parseWorkflowMarkdown(content, resolved);
				if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
					return {
						error: `Workflow file "${targetPath}" does not contain any steps.`,
					};
				}
				return { filePath: resolved, workflow: parsed };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					error: `Failed to parse workflow Markdown: ${message}`,
				};
			}
		}

		const parsed = JSON.parse(content) as WorkflowDef;
		if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
			return {
				error: `Workflow file "${targetPath}" does not contain any steps.`,
			};
		}
		return { filePath: resolved, workflow: parsed };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { error: `Failed to parse workflow JSON: ${message}` };
	}
}
