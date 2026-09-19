import * as path from "node:path";
import type { WorkflowAst, WorkflowStep } from "../../workflow.ts";
import type { MarkdownNode } from "./ast.ts";
import { parse } from "./parsing.ts";

export interface ParsedHeading {
	type: "if" | "else" | "gate" | "step";
	condition?: string;
	title: string;
	depth: number;
}

function getInnerText(node?: MarkdownNode): string {
	if (!node) return "";
	if ("content" in node) return node.content;
	if ("children" in node) {
		return Array.isArray(node.children)
			? node.children.map(getInnerText).join("")
			: getInnerText(node.children);
	}
	return "";
}

const KEYWORDS = ["if", "else", "no", "gate"] as const;

const KEYWORD_REGEX = new RegExp(
	`^(${KEYWORDS.join("|")})\\s*:(?:\\s*(.*))?$`,
	"i",
);

function stripLeading(str: string): string {
	return str.replace(/^[^\p{L}]+/u, "");
}

function removeFirstWord(str: string): string {
	return str.replace(/^\S+/, "");
}

export function parseHeading(
	heading: MarkdownNode | string,
	depth = 2,
): ParsedHeading {
	const effectiveDepth =
		typeof heading === "string"
			? depth
			: "depth" in heading
				? heading.depth
				: depth;
	const text = (
		typeof heading === "string" ? heading : getInnerText(heading)
	).trim();

	let candidate = stripLeading(text);
	let match = candidate.match(KEYWORD_REGEX);

	if (!match) {
		candidate = stripLeading(removeFirstWord(candidate));
		match = candidate.match(KEYWORD_REGEX);
	}

	if (!match) return { type: "step", title: text, depth: effectiveDepth };

	const keyword = match[1].toLowerCase();
	const condition = (match[2] ?? "").trim();

	if (keyword === "else" || keyword === "no") {
		return { type: "else", title: condition || keyword, depth: effectiveDepth };
	}
	if (keyword === "gate") {
		return {
			type: "gate",
			title: condition || keyword,
			depth: effectiveDepth,
		};
	}
	return {
		type: "if",
		condition,
		title: condition || keyword,
		depth: effectiveDepth,
	};
}

function sliceNodesMarkdown(nodes?: MarkdownNode[]): string {
	if (!nodes?.length) return "";
	return nodes
		.map((n) => n.source)
		.join("\n\n")
		.trim();
}

interface ParsedStepsResult {
	preamble?: string;
	steps: WorkflowStep[];
}

function parseBranchSteps(
	nodes: MarkdownNode[],
	targetDepth: number,
	defaultTitle: string,
	fallback: string,
): WorkflowStep[] {
	if (!nodes.length) return [];
	const result = parseSteps(nodes, targetDepth);
	const steps = [...result.steps];
	if (result.preamble || !steps.length) {
		steps.unshift({
			type: "step",
			title: defaultTitle,
			instruction: result.preamble || fallback,
		});
	}
	return steps;
}

function parseSteps(
	nodes: MarkdownNode[],
	targetDepth: number,
): ParsedStepsResult {
	if (!nodes?.length) return { steps: [] };

	const candidateHeadings = nodes
		.map((node, idx) => ({ node, idx }))
		.filter(
			(item) =>
				item.node.type === "heading" &&
				typeof item.node.depth === "number" &&
				item.node.depth >= targetDepth,
		) as Array<{ node: MarkdownNode & { depth: number }; idx: number }>;

	if (candidateHeadings.length === 0) {
		return { preamble: sliceNodesMarkdown(nodes), steps: [] };
	}

	const effectiveDepth = Math.min(
		...candidateHeadings.map((h) => h.node.depth),
	);
	const headingsAtDepth = candidateHeadings.filter(
		(h) => h.node.depth === effectiveDepth,
	);

	const preambleNodes = nodes.slice(0, headingsAtDepth[0].idx);
	const preamble =
		preambleNodes.length > 0 ? sliceNodesMarkdown(preambleNodes) : undefined;

	const sections = headingsAtDepth.map((cur, i) => ({
		headingNode: cur.node,
		bodyNodes: nodes.slice(
			cur.idx + 1,
			headingsAtDepth[i + 1]?.idx ?? nodes.length,
		),
	}));

	const steps: WorkflowStep[] = [];

	for (const sec of sections) {
		const parsed = parseHeading(sec.headingNode);

		if (parsed.type === "if") {
			const condition = parsed.condition || parsed.title;

			const childHeadings = sec.bodyNodes
				.map((node, idx) => ({ node, idx }))
				.filter(
					(item) =>
						item.node.type === "heading" &&
						typeof item.node.depth === "number" &&
						item.node.depth > effectiveDepth,
				) as Array<{ node: MarkdownNode & { depth: number }; idx: number }>;

			let conditionInstruction: string | undefined;
			let yesSteps: WorkflowStep[] = [];
			let noSteps: WorkflowStep[] | undefined;

			if (childHeadings.length > 0) {
				const childDepth = Math.min(...childHeadings.map((h) => h.node.depth));
				const directChildren = childHeadings.filter(
					(h) => h.node.depth === childDepth,
				);

				const preNodes = sec.bodyNodes.slice(0, directChildren[0].idx);
				conditionInstruction = sliceNodesMarkdown(preNodes) || undefined;

				const elseChildIdx = directChildren.findIndex(
					(child) => parseHeading(child.node).type === "else",
				);

				const yesEnd =
					elseChildIdx !== -1 ? directChildren[elseChildIdx].idx : undefined;
				yesSteps = parseBranchSteps(
					sec.bodyNodes.slice(directChildren[0].idx, yesEnd),
					childDepth,
					`${condition} yes`,
					"Execute condition true branch",
				);

				if (elseChildIdx !== -1) {
					noSteps = parseBranchSteps(
						sec.bodyNodes.slice(directChildren[elseChildIdx].idx),
						childDepth,
						`${condition} no`,
						"Execute condition false branch",
					);
				}
			} else {
				conditionInstruction = sliceNodesMarkdown(sec.bodyNodes) || undefined;
			}

			steps.push({
				type: "condition",
				title: parsed.title,
				condition,
				...(conditionInstruction ? { instruction: conditionInstruction } : {}),
				yes: { steps: yesSteps },
				...(noSteps ? { no: { steps: noSteps } } : {}),
			});
		} else {
			const instruction = sliceNodesMarkdown(sec.bodyNodes) || parsed.title;
			if (parsed.type === "gate") {
				steps.push({ type: "gate", title: parsed.title, instruction });
			} else {
				const title =
					parsed.type === "else" &&
					(!parsed.title || parsed.title === "else" || parsed.title === "no")
						? "No"
						: parsed.title;
				steps.push({ type: "step", title, instruction });
			}
		}
	}

	return { preamble, steps };
}

function parseFrontmatter(markdown: string): {
	frontmatter?: Record<string, string>;
	content: string;
} {
	const trimmed = markdown.replace(/^\s*\n/, "");
	const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { content: markdown };

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const [k, ...v] = line.split(":");
		if (k && v.length) {
			frontmatter[k.trim()] = v
				.join(":")
				.trim()
				.replace(/^["']|["']$/g, "");
		}
	}
	return { frontmatter, content: trimmed.slice(match[0].length) };
}

export function parseWorkflowMarkdown(
	content: string,
	filePath?: string,
): WorkflowAst {
	const { frontmatter, content: mdContent } = parseFrontmatter(content);
	const ast = parse(mdContent);
	const nodes = ast.type === "fragment" ? ast.children : [ast];

	let name = frontmatter?.name;
	let remainingNodes = nodes;

	const h1Idx = nodes.findIndex((n) => n.type === "heading" && n.depth === 1);
	if (h1Idx !== -1) {
		name ??= getInnerText(nodes[h1Idx]).trim();
		remainingNodes = nodes.slice(h1Idx + 1);
	}

	if (!name && filePath) {
		name = path.basename(filePath, path.extname(filePath));
	}

	const parsed = parseSteps(remainingNodes, 2);
	return {
		name: name || "Workflow",
		...(frontmatter?.description
			? { description: frontmatter.description }
			: {}),
		...(parsed.preamble ? { preamble: parsed.preamble } : {}),
		steps: parsed.steps,
	};
}
