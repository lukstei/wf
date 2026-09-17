import { describe, expect, test } from "vitest";
import { getHelpText, parseCommand } from "./parseCommand.ts";

describe("parseCommand.ts", () => {
	test("parseCommand recognizes valid commands", () => {
		const commands = [
			parseCommand("/wf path/to/wf.json"),
			parseCommand("/wf-show path/to/wf.json"),
			parseCommand("/wf-show"),
			parseCommand("/wf-next"),
			parseCommand("/wf-stop"),
			parseCommand("/wf-help"),
		];
		expect(commands).toMatchInlineSnapshot(`
			[
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "show",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "show",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "next",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "stop",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "help",
			    },
			    "helpText": "Show this message directly to the user:

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    "isWfCommand": true,
			  },
			]
		`);
	});

	test("parseCommand rejects non-wf commands and mentions", () => {
		expect(parseCommand("hello world").isWfCommand).toBe(false);
		expect(parseCommand("run something").isWfCommand).toBe(false);
		expect(parseCommand("wf path/to/wf.json").isWfCommand).toBe(false);
		expect(parseCommand("wf next").isWfCommand).toBe(false);
		expect(parseCommand("wf-next").isWfCommand).toBe(false);
		expect(
			parseCommand("see @[.agents/plugins/wf/skills/wf]").isWfCommand,
		).toBe(false);
		expect(
			parseCommand(">We should not break /wf run <file>").isWfCommand,
		).toBe(false);
		expect(parseCommand("Check out /wf when you can").isWfCommand).toBe(false);
	});

	test("parseCommand supports @ and $ prefixes for Codex and other harnesses", () => {
		const commands = [
			parseCommand("@wf path/to/wf.json"),
			parseCommand("$wf path/to/wf.json"),
			parseCommand("@wf:wf path/to/wf.json"),
			parseCommand("$wf:wf path/to/wf.json"),
			parseCommand("@wf: path/to/wf.json"),
			parseCommand("@wf-next"),
			parseCommand("$wf-next"),
			parseCommand("@wf:wf-next"),
			parseCommand("$wf:wf-next"),
			parseCommand("@wf-show"),
			parseCommand("$wf-stop"),
			parseCommand("@wf-help"),
		];

		expect(commands).toMatchInlineSnapshot(`
			[
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {
			        "path": "path/to/wf.json",
			      },
			      "name": "run",
			    },
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "next",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "next",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "next",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "next",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "show",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "stop",
			    },
			    "helpText": undefined,
			    "isWfCommand": true,
			  },
			  {
			    "command": {
			      "args": {},
			      "name": "help",
			    },
			    "helpText": "Show this message directly to the user:

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    "isWfCommand": true,
			  },
			]
		`);
	});

	test("parseCommand handles various path formats for /wf", () => {
		const cases = [
			parseCommand("/wf @[examples/sample-wf.json]"),
			parseCommand("/wf @examples/sample-wf.json"),
			parseCommand('/wf "examples/sample-wf.json"'),
			parseCommand("/wf 'examples/sample-wf.json'"),
			parseCommand("  /wf   @[examples/sample-wf.json]  "),
			parseCommand("/wf <workflow-file>"),
		];

		expect(cases[0].command).toEqual({
			name: "run",
			args: { path: "examples/sample-wf.json" },
		});
		expect(cases[1].command).toEqual({
			name: "run",
			args: { path: "examples/sample-wf.json" },
		});
		expect(cases[2].command).toEqual({
			name: "run",
			args: { path: "examples/sample-wf.json" },
		});
		expect(cases[3].command).toEqual({
			name: "run",
			args: { path: "examples/sample-wf.json" },
		});
		expect(cases[4].command).toEqual({
			name: "run",
			args: { path: "examples/sample-wf.json" },
		});
		expect(cases[5].command).toEqual({
			name: "run",
			args: { path: "<workflow-file>" },
		});
	});

	test("parseCommand guides user when using old subcommand syntax", () => {
		const resRun = parseCommand("/wf run path/to/wf.json");
		expect(resRun.error).toBe("Use /wf <file> directly without 'run'.");

		const resStatus = parseCommand("/wf status");
		expect(resStatus.error).toBe("Use /wf-show instead of /wf status.");

		const resNext = parseCommand("/wf next");
		expect(resNext.error).toBe("Use /wf-next instead of /wf next.");

		const resStop = parseCommand("/wf stop");
		expect(resStop.error).toBe("Use /wf-stop instead of /wf stop.");

		const resHelp = parseCommand("/wf help");
		expect(resHelp.error).toBe("Use /wf-help instead of /wf help.");
	});

	test("parseCommand rejects unknown subcommands", () => {
		const resUnknown = parseCommand("/wf-foo");
		expect(resUnknown.error).toBe('Unknown command: "/wf-foo"');

		const resStatus = parseCommand("/wf-status");
		expect(resStatus.error).toBe('Unknown command: "/wf-status"');
	});

	test("parseCommand detects missing arguments for /wf", () => {
		const res = parseCommand("/wf");
		expect(res.error).toBe("Missing required argument: <workflow-file>");
		expect(res.isWfCommand).toBe(true);
	});

	test("parseCommand handles /wf-show with and without arguments", () => {
		const validWithArg = parseCommand("/wf-show examples/sample-wf.md");
		expect(validWithArg.command).toEqual({
			name: "show",
			args: { path: "examples/sample-wf.md" },
		});

		const validWithoutArg = parseCommand("/wf-show");
		expect(validWithoutArg.command).toEqual({ name: "show", args: {} });

		const withMetadata = parseCommand(
			"<USER_REQUEST>\n/wf-show \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nSome metadata\n</ADDITIONAL_METADATA>",
		);
		expect(withMetadata.command).toEqual({ name: "show", args: {} });

		const oldSyntax = parseCommand("/wf show examples/sample-wf.md");
		expect(oldSyntax.error).toBe("Use /wf-show instead of /wf show.");
	});

	test("getHelpText returns usage and command listing", () => {
		expect(getHelpText("Custom header")).toMatchInlineSnapshot(`
      "[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Custom header

      Workflow Runner Commands:
        /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
        /wf-show [<workflow-file>] - Visualize workflow and show status / progress
        /wf-next                   - Execute the next step in paused mode
        /wf-stop                   - Stop and reset the active workflow
        /wf-help                   - Show this help reference"
    `);
	});

	test("getHelpText returns usage instructions to display directly to user when no error", () => {
		expect(getHelpText()).toMatchInlineSnapshot(`
      "Show this message directly to the user:

      Workflow Runner Commands:
        /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
        /wf-show [<workflow-file>] - Visualize workflow and show status / progress
        /wf-next                   - Execute the next step in paused mode
        /wf-stop                   - Stop and reset the active workflow
        /wf-help                   - Show this help reference"
    `);
	});
});
