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

		expect(cases.map((c) => c.command)).toMatchInlineSnapshot(`
			[
			  {
			    "args": {
			      "path": "examples/sample-wf.json",
			    },
			    "name": "run",
			  },
			  {
			    "args": {
			      "path": "examples/sample-wf.json",
			    },
			    "name": "run",
			  },
			  {
			    "args": {
			      "path": "examples/sample-wf.json",
			    },
			    "name": "run",
			  },
			  {
			    "args": {
			      "path": "examples/sample-wf.json",
			    },
			    "name": "run",
			  },
			  {
			    "args": {
			      "path": "examples/sample-wf.json",
			    },
			    "name": "run",
			  },
			  {
			    "args": {
			      "path": "<workflow-file>",
			    },
			    "name": "run",
			  },
			]
		`);
	});

	test("parseCommand passes through non-runner skills", () => {
		// Non-runner skills like /wf-convert must not be intercepted by the runner hook
		expect(parseCommand("/wf-convert").isWfCommand).toBe(false);
		expect(parseCommand("/wf-convert derive-client").isWfCommand).toBe(false);
		expect(parseCommand("/wf-foo").isWfCommand).toBe(false);
		expect(parseCommand("/wf-status").isWfCommand).toBe(false);
	});

	test("parseCommand detects missing arguments for /wf", () => {
		const res = parseCommand("/wf");
		expect(res.error).toBe("Missing required argument: <workflow-file>");
		expect(res.isWfCommand).toBe(true);
	});

	test("parseCommand handles /wf-show with and without arguments", () => {
		const cases = [
			parseCommand("/wf-show examples/sample-wf.md"),
			parseCommand("/wf-show"),
			parseCommand(
				"<USER_REQUEST>\n/wf-show \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nSome metadata\n</ADDITIONAL_METADATA>",
			),
		];
		expect(cases.map((c) => c.command)).toMatchInlineSnapshot(`
			[
			  {
			    "args": {
			      "path": "examples/sample-wf.md",
			    },
			    "name": "show",
			  },
			  {
			    "args": {},
			    "name": "show",
			  },
			  {
			    "args": {},
			    "name": "show",
			  },
			]
		`);
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

	test("parseCommand rejects unexpected arguments for parameterless commands", () => {
		const cases = [
			parseCommand("/wf-next unexpected_arg"),
			parseCommand("/wf-stop unexpected_arg"),
			parseCommand("/wf-help unexpected_arg"),
			parseCommand("/wf   "),
		];

		expect(cases).toMatchInlineSnapshot(`
			[
			  {
			    "error": "'next' command does not accept arguments: "unexpected_arg"",
			    "helpText": "[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  'next' command does not accept arguments: "unexpected_arg"

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    "isWfCommand": true,
			  },
			  {
			    "error": "'stop' command does not accept arguments: "unexpected_arg"",
			    "helpText": "[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  'stop' command does not accept arguments: "unexpected_arg"

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    "isWfCommand": true,
			  },
			  {
			    "error": "'help' command does not accept arguments: "unexpected_arg"",
			    "helpText": "[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  'help' command does not accept arguments: "unexpected_arg"

			Workflow Runner Commands:
			  /wf <workflow-file>        - Start a workflow from a Markdown or JSON file
			  /wf-show [<workflow-file>] - Visualize workflow and show status / progress
			  /wf-next                   - Execute the next step in paused mode
			  /wf-stop                   - Stop and reset the active workflow
			  /wf-help                   - Show this help reference",
			    "isWfCommand": true,
			  },
			  {
			    "error": "Missing required argument: <workflow-file>",
			    "helpText": "[Workflow Error] CANCEL EXECUTION AND SHOW THIS MESSAGE TO THE USER:  Missing required argument: <workflow-file>

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
});
