import * as path from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { WorkflowDef, WorkflowStep } from "./workflow.ts";

export interface ParsedHeading {
	type: "if" | "else" | "gate" | "step";
	condition?: string;
	title: string;
	depth: number;
}

interface MarkdownNode {
	type?: string;
	value?: string;
	depth?: number;
	children?: MarkdownNode[];
	position?: {
		start?: { offset?: number };
		end?: { offset?: number };
	};
}

function getInnerText(node?: MarkdownNode | null): string {
	if (!node) return "";
	if (typeof node.value === "string") return node.value;
	return Array.isArray(node.children)
		? node.children.map((child) => getInnerText(child)).join("")
		: "";
}

const KEYWORDS = ["if", "else", "no", "gate"] as const;
type HeadingKeyword = (typeof KEYWORDS)[number];

const KEYWORD_REGEX = new RegExp(
	`^(${KEYWORDS.join("|")})(?:[:\\s]+(.*))?$`,
	"i",
);

function stripLeading(str: string): string {
	return str.replace(/^[^\p{L}]+/u, "");
}

function removeFirstWord(str: string): string {
	return str.replace(/^\S+/, "");
}

export function parseHeading(heading?: MarkdownNode | null): ParsedHeading {
	const depth = heading?.depth ?? 2;
	const text = getInnerText(heading).trim();

	let candidate = stripLeading(text);
	let match = candidate.match(KEYWORD_REGEX);

	if (!match) {
		candidate = stripLeading(removeFirstWord(candidate));
		match = candidate.match(KEYWORD_REGEX);
	}

	if (!match) return { type: "step", title: text, depth };

	const keyword = match[1].toLowerCase();
	const condition = (match[2] ?? "").trim();

	if (keyword === "else" || keyword === "no") {
		return { type: "else", title: condition || keyword, depth };
	}
	if (keyword === "gate") {
		return {
			type: "gate",
			title: condition || keyword,
			depth,
		};
	}
	return {
		type: "if",
		condition,
		title: condition || keyword,
		depth,
	};
}

function sliceNodesMarkdown(markdown: string, nodes?: MarkdownNode[]): string {
	if (!nodes?.length) return "";
	const start = nodes[0]?.position?.start?.offset;
	const end = nodes[nodes.length - 1]?.position?.end?.offset;
	return typeof start === "number" && typeof end === "number"
		? markdown.slice(start, end).trim()
		: "";
}

interface ParsedStepsResult {
	preamble?: string;
	steps: WorkflowStep[];
}

function parseBranchSteps(
	nodes: MarkdownNode[],
	targetDepth: number,
	markdown: string,
	defaultTitle: string,
	fallback: string,
): WorkflowStep[] {
	if (!nodes.length) return [];
	const candidateHeadings = nodes.filter(
		(n) =>
			n.type === "heading" &&
			typeof n.depth === "number" &&
			n.depth >= targetDepth,
	);
	if (candidateHeadings.length === 0) {
		const text = sliceNodesMarkdown(markdown, nodes);
		return [
			{
				type: "step",
				title: defaultTitle,
				instruction: text || fallback,
			},
		];
	}
	const result = parseSteps(nodes, targetDepth, markdown);
	const steps = [...result.steps];
	if (result.preamble) {
		steps.unshift({
			type: "step",
			title: defaultTitle,
			instruction: result.preamble,
		});
	}
	return steps;
}

function parseSteps(
	nodes: MarkdownNode[],
	targetDepth: number,
	markdown: string,
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
		return { preamble: sliceNodesMarkdown(markdown, nodes), steps: [] };
	}

	const effectiveDepth = Math.min(
		...candidateHeadings.map((h) => h.node.depth),
	);
	const headingsAtDepth = candidateHeadings.filter(
		(h) => h.node.depth === effectiveDepth,
	);

	const preambleNodes = nodes.slice(0, headingsAtDepth[0].idx);
	const preamble =
		preambleNodes.length > 0
			? sliceNodesMarkdown(markdown, preambleNodes)
			: undefined;

	const sections = headingsAtDepth.map((cur, i) => ({
		headingNode: cur.node,
		bodyNodes: nodes.slice(
			cur.idx + 1,
			headingsAtDepth[i + 1]?.idx ?? nodes.length,
		),
	}));

	const steps: WorkflowStep[] = [];
	let i = 0;

	while (i < sections.length) {
		const sec = sections[i];
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
				conditionInstruction =
					sliceNodesMarkdown(markdown, preNodes) || undefined;

				let balance = 0;
				let elseChildIdx = -1;
				for (let j = 0; j < directChildren.length; j++) {
					const p = parseHeading(directChildren[j].node);
					if (p.type === "if") {
						balance++;
					} else if (p.type === "else") {
						if (balance === 0) {
							elseChildIdx = j;
							break;
						}
						balance--;
					}
				}

				if (elseChildIdx !== -1) {
					const yesNodes = sec.bodyNodes.slice(
						directChildren[0].idx,
						directChildren[elseChildIdx].idx,
					);
					const noNodes = sec.bodyNodes.slice(directChildren[elseChildIdx].idx);

					yesSteps = parseBranchSteps(
						yesNodes,
						childDepth,
						markdown,
						`${condition} yes`,
						"Execute condition true branch",
					);
					noSteps = parseBranchSteps(
						noNodes,
						childDepth,
						markdown,
						`${condition} no`,
						"Execute condition false branch",
					);
				} else {
					const yesNodes = sec.bodyNodes.slice(directChildren[0].idx);
					yesSteps = parseBranchSteps(
						yesNodes,
						childDepth,
						markdown,
						`${condition} yes`,
						"Execute condition true branch",
					);

					if (
						i + 1 < sections.length &&
						parseHeading(sections[i + 1].headingNode).type === "else"
					) {
						i++;
						noSteps = parseBranchSteps(
							sections[i].bodyNodes,
							effectiveDepth + 1,
							markdown,
							parseHeading(sections[i].headingNode).title || `${condition} no`,
							"Execute condition false branch",
						);
					}
				}
			} else {
				if (
					i + 1 < sections.length &&
					parseHeading(sections[i + 1].headingNode).type === "else"
				) {
					const text = sliceNodesMarkdown(markdown, sec.bodyNodes);
					yesSteps = [
						{
							type: "step",
							title: `${condition} yes`,
							instruction: text || "Execute condition true branch",
						},
					];
					i++;
					const elseHeading = parseHeading(sections[i].headingNode);
					noSteps = parseBranchSteps(
						sections[i].bodyNodes,
						effectiveDepth + 1,
						markdown,
						elseHeading.title &&
							elseHeading.title !== "else" &&
							elseHeading.title !== "no"
							? elseHeading.title
							: `${condition} no`,
						"Execute condition false branch",
					);
				} else {
					const text = sliceNodesMarkdown(markdown, sec.bodyNodes);
					conditionInstruction = text || undefined;
				}
			}

			steps.push({
				type: "condition",
				title: parsed.title,
				condition,
				...(conditionInstruction ? { instruction: conditionInstruction } : {}),
				yes: { steps: yesSteps },
				...(noSteps ? { no: { steps: noSteps } } : {}),
			});
		} else if (parsed.type === "else") {
			const instruction = sliceNodesMarkdown(markdown, sec.bodyNodes);
			steps.push({
				type: "step",
				title:
					parsed.title && parsed.title !== "else" && parsed.title !== "no"
						? parsed.title
						: "No",
				instruction: instruction || parsed.title,
			});
		} else if (parsed.type === "gate") {
			const instruction = sliceNodesMarkdown(markdown, sec.bodyNodes);
			steps.push({
				type: "gate",
				title: parsed.title,
				instruction: instruction || parsed.title,
			});
		} else {
			const instruction = sliceNodesMarkdown(markdown, sec.bodyNodes);
			steps.push({
				type: "step",
				title: parsed.title,
				instruction: instruction || parsed.title,
			});
		}
		i++;
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
): WorkflowDef {
	const { frontmatter, content: mdContent } = parseFrontmatter(content);
	const nodes = (fromMarkdown(mdContent).children || []) as MarkdownNode[];

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

	const parsed = parseSteps(remainingNodes, 2, mdContent);
	return {
		name: name || "Workflow",
		...(frontmatter?.description
			? { description: frontmatter.description }
			: {}),
		...(parsed.preamble ? { preamble: parsed.preamble } : {}),
		steps: parsed.steps,
	};
}
