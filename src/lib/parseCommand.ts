type CommandName = "run" | "next" | "stop" | "help" | "show";

interface CommandDef<T = unknown> {
	name: CommandName;
	slashCommand: string;
	params: string;
	description: string;
	parse: (
		argsStr: string,
	) => { success: true; args: T } | { success: false; error: string };
}

type ParsedCommand =
	| { name: "run"; args: { path: string } }
	| { name: "show"; args: { path?: string } }
	| { name: "next"; args: Record<string, never> }
	| { name: "stop"; args: Record<string, never> }
	| { name: "help"; args: Record<string, never> };

export type RunCommand = Extract<ParsedCommand, { name: "run" }>;
export type ShowCommand = Extract<ParsedCommand, { name: "show" }>;

export interface ParseResult {
	isWfCommand: boolean;
	command?: ParsedCommand;
	helpText?: string;
	error?: string;
}

function parseFilePath(
	argsStr: string,
):
	| { success: true; args: { path: string } }
	| { success: false; error: string } {
	const trimmed = argsStr.trim();
	if (!trimmed) {
		return {
			success: false,
			error: "Missing required argument: <workflow-file>",
		};
	}

	// Handle AGY file mentions: @[path/to/file]
	const bracketMatch = trimmed.match(/^@\[([^\]]+)\]/);
	if (bracketMatch) {
		return { success: true, args: { path: bracketMatch[1].trim() } };
	}

	// Handle quoted paths: "path" or 'path'
	const quoteMatch = trimmed.match(/^["']([^"']+)["']/);
	if (quoteMatch) {
		return { success: true, args: { path: quoteMatch[1].trim() } };
	}

	// Handle simple @path (e.g. @examples/sample-wf.json)
	const atMatch = trimmed.match(/^@(\S+)/);
	if (atMatch) {
		return { success: true, args: { path: atMatch[1].trim() } };
	}

	const firstToken = trimmed.split(/\s+/)[0];
	return { success: true, args: { path: firstToken } };
}

function parseOptionalFilePath(
	argsStr: string,
):
	| { success: true; args: { path?: string } }
	| { success: false; error: string } {
	const trimmed = argsStr.trim();
	if (!trimmed) {
		return { success: true, args: {} };
	}
	return parseFilePath(trimmed);
}

const COMMAND_DEFS: CommandDef[] = [
	{
		name: "run",
		slashCommand: "/wf",
		params: "<workflow-file>",
		description: "Start a workflow from a Markdown or JSON file",
		parse: parseFilePath,
	},
	{
		name: "show",
		slashCommand: "/wf-show",
		params: "[<workflow-file>]",
		description: "Visualize workflow and show status / progress",
		parse: parseOptionalFilePath,
	},
	{
		name: "next",
		slashCommand: "/wf-next",
		params: "",
		description: "Execute the next step in paused mode",
		parse: (argsStr: string) => {
			if (argsStr.trim().length > 0) {
				return {
					success: false,
					error: `'next' command does not accept arguments: "${argsStr.trim()}"`,
				};
			}
			return { success: true, args: {} };
		},
	},
	{
		name: "stop",
		slashCommand: "/wf-stop",
		params: "",
		description: "Stop and reset the active workflow",
		parse: (argsStr: string) => {
			if (argsStr.trim().length > 0) {
				return {
					success: false,
					error: `'stop' command does not accept arguments: "${argsStr.trim()}"`,
				};
			}
			return { success: true, args: {} };
		},
	},
	{
		name: "help",
		slashCommand: "/wf-help",
		params: "",
		description: "Show this help reference",
		parse: (argsStr: string) => {
			if (argsStr.trim().length > 0) {
				return {
					success: false,
					error: `'help' command does not accept arguments: "${argsStr.trim()}"`,
				};
			}
			return { success: true, args: {} };
		},
	},
];

export function getHelpText(error?: string): string {
	const lines: string[] = [];
	if (error) {
		lines.push(
			`[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  ${error}`,
			"",
		);
	}
	lines.push("Workflow Runner Commands:");
	for (const cmd of COMMAND_DEFS) {
		const usage = `${cmd.slashCommand}${cmd.params ? ` ${cmd.params}` : ""}`;
		lines.push(`  ${usage.padEnd(26)} - ${cmd.description}`);
	}
	return lines.join("\n");
}

function findCommandByName(name: CommandName): CommandDef | undefined {
	return COMMAND_DEFS.find((c) => c.name === name);
}

/**
 * Parses user input to extract and validate `/wf <file>` or `/wf-*` commands.
 */
export function parseCommand(input: string): ParseResult {
	let cleanInput = input.trim();

	// Extract user request content if wrapped in <USER_REQUEST> tags (ignoring any subsequent <ADDITIONAL_METADATA>)
	const userRequestMatch = cleanInput.match(
		/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i,
	);
	if (userRequestMatch) {
		cleanInput = userRequestMatch[1].trim();
	} else {
		cleanInput = cleanInput
			.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, "")
			.trim();
	}

	// Match slash command at the beginning of the line, matching arguments only on the same line
	const match = cleanInput.match(
		/^\/(wf-(?:status|next|stop|help|show)|wf)\b(?:[^\S\r\n]+([^\r\n]*)|$)/,
	);
	if (!match) {
		return { isWfCommand: false };
	}

	const slashToken = match[1];
	const rawArgs = (match[2] ?? "").trim();

	// 1. Direct subcommand skills: /wf-next, /wf-stop, /wf-help, /wf-show (and deprecated /wf-status)
	if (slashToken !== "wf") {
		if (slashToken === "wf-status") {
			const msg = "The /wf-status command has been replaced by /wf-show.";
			return {
				isWfCommand: true,
				error: msg,
				helpText: getHelpText(msg),
			};
		}

		const cmdName = slashToken.replace(/^wf-/, "") as CommandName;
		const def = findCommandByName(cmdName);
		if (!def) {
			return {
				isWfCommand: true,
				error: `Unknown command: "/${slashToken}"`,
				helpText: getHelpText(`Unknown command: "/${slashToken}"`),
			};
		}

		const parsed = def.parse(rawArgs);
		if (!parsed.success) {
			return {
				isWfCommand: true,
				error: parsed.error,
				helpText: getHelpText(parsed.error),
			};
		}

		return {
			isWfCommand: true,
			command: {
				name: def.name,
				args: parsed.args,
			} as ParsedCommand,
			helpText: def.name === "help" ? getHelpText() : undefined,
		};
	}

	// 2. Main command: /wf <workflow-file>
	if (!rawArgs) {
		return {
			isWfCommand: true,
			error: "Missing required argument: <workflow-file>",
			helpText: getHelpText("Missing required argument: <workflow-file>"),
		};
	}

	const firstToken = rawArgs.split(/\s+/)[0].toLowerCase();
	// If user used old syntax like /wf status, /wf next, or /wf run, guide them to new syntax
	if (["status", "next", "stop", "help", "run", "show"].includes(firstToken)) {
		const hint =
			firstToken === "run"
				? "Use /wf <file> directly without 'run'."
				: firstToken === "status"
					? "Use /wf-show instead of /wf status."
					: `Use /wf-${firstToken} instead of /wf ${firstToken}.`;
		return {
			isWfCommand: true,
			error: hint,
			helpText: getHelpText(hint),
		};
	}

	const parsed = parseFilePath(rawArgs);
	if (!parsed.success) {
		return {
			isWfCommand: true,
			error: parsed.error,
			helpText: getHelpText(parsed.error),
		};
	}

	return {
		isWfCommand: true,
		command: {
			name: "run",
			args: parsed.args,
		},
	};
}
