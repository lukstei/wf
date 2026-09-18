import * as fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getCliHelp, parseCliArgs, runCli } from "./cli.ts";
import { getStatePath } from "./state.ts";
import { stripAbsolutePath } from "./test-utils.ts";

describe("src/cli.ts", () => {
	const testConversationId = "test-cli-suite";

	beforeEach(() => {
		const stateFile = getStatePath(testConversationId);
		if (fs.existsSync(stateFile)) {
			fs.unlinkSync(stateFile);
		}
	});

	it("parseCliArgs parses arguments and flags correctly", () => {
		const cases = [
			parseCliArgs(["hook", "pre"]),
			parseCliArgs(["hook", "stop"]),
			parseCliArgs(["stop"]),
			parseCliArgs(["next"]),
			parseCliArgs(["show"]),
			parseCliArgs(["show", "examples/sample-wf.json"]),
			parseCliArgs(["start", "examples/sample-wf.json"]),
			parseCliArgs(["run", "examples/sample-wf.json"]),
			parseCliArgs(["help"]),
			parseCliArgs(["--help"]),
			parseCliArgs(["-h"]),
			parseCliArgs(["--version"]),
			parseCliArgs(["-v"]),
			parseCliArgs([]),
		];

		expect(cases).toMatchInlineSnapshot(`
      [
        {
          "args": [
            "pre",
          ],
          "command": "hook",
          "options": {},
          "subcommand": "pre",
        },
        {
          "args": [
            "stop",
          ],
          "command": "hook",
          "options": {},
          "subcommand": "stop",
        },
        {
          "args": [],
          "command": "stop",
          "options": {},
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": "next",
          "options": {},
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": "show",
          "options": {},
          "subcommand": undefined,
        },
        {
          "args": [
            "examples/sample-wf.json",
          ],
          "command": "show",
          "options": {},
          "subcommand": "examples/sample-wf.json",
        },
        {
          "args": [
            "examples/sample-wf.json",
          ],
          "command": "start",
          "options": {},
          "subcommand": "examples/sample-wf.json",
        },
        {
          "args": [
            "examples/sample-wf.json",
          ],
          "command": "run",
          "options": {},
          "subcommand": "examples/sample-wf.json",
        },
        {
          "args": [],
          "command": "help",
          "options": {},
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": undefined,
          "options": {
            "help": true,
          },
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": undefined,
          "options": {
            "help": true,
          },
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": undefined,
          "options": {
            "version": true,
          },
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": undefined,
          "options": {
            "version": true,
          },
          "subcommand": undefined,
        },
        {
          "args": [],
          "command": undefined,
          "options": {},
          "subcommand": undefined,
        },
      ]
    `);
	});

	it("runCli handles help and version flags", async () => {
		let out = "";
		const resHelp = await runCli(["--help"], { stdout: (m) => (out += m) });
		expect(resHelp.exitCode).toBe(0);
		expect(out).toBe(getCliHelp());

		let ver = "";
		const resVer = await runCli(["-v"], { stdout: (m) => (ver += m) });
		expect(resVer.exitCode).toBe(0);
		expect(ver).toBe("0.1.0");
	});

	it("runCli validates hook subcommands", async () => {
		const errs: string[] = [];
		const resMissing = await runCli(["hook"], { stderr: (m) => errs.push(m) });
		expect(resMissing.exitCode).toBe(1);

		const resInvalid = await runCli(["hook", "invalid"], {
			stderr: (m) => errs.push(m),
		});
		expect(resInvalid.exitCode).toBe(1);

		expect(errs).toMatchInlineSnapshot(`
      [
        "[wf error] Missing or unsupported hook event: "". Expected "pre" or "stop".",
        "[wf error] Missing or unsupported hook event: "invalid". Expected "pre" or "stop".",
      ]
    `);
	});

	it("runCli dispatches hook pre and hook stop through runtime shim", async () => {
		const rawInputPre = JSON.stringify({
			conversationId: "cli-test-hook-pre",
			workspacePaths: ["/test"],
		});
		let preStdout = "";
		const resPre = await runCli(["hook", "pre"], {
			stdin: rawInputPre,
			env: { AGY_HOOK_ACTIVE: "1" },
			stdout: (m) => (preStdout += m),
		});
		expect(resPre.exitCode).toBe(0);
		expect(preStdout).toBe("{}");

		const rawInputStop = JSON.stringify({
			conversationId: "cli-test-hook-stop",
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});
		let stopStdout = "";
		const resStop = await runCli(["hook", "stop"], {
			stdin: rawInputStop,
			env: { AGY_HOOK_ACTIVE: "1" },
			stdout: (m) => (stopStdout += m),
		});
		expect(resStop.exitCode).toBe(0);
		expect(JSON.parse(stopStdout)).toEqual({ decision: "allow" });
	});

	it("runCli hard exits code 1 when no harness conversation ID is present for session commands", async () => {
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env: { PWD: process.cwd() }, // No harness conversation env set
		};

		const stopRes = await runCli(["stop"], io);
		expect(stopRes.exitCode).toBe(1);

		const startRes = await runCli(["start", "examples/sample-wf.json"], io);
		expect(startRes.exitCode).toBe(1);

		const nextRes = await runCli(["next"], io);
		expect(nextRes.exitCode).toBe(1);

		const showRes = await runCli(["show"], io);
		expect(showRes.exitCode).toBe(1);

		expect(outputs).toMatchInlineSnapshot(`
			[
			  "ERROR: [wf error] Unable to resolve active conversation ID from harness environment.",
			  "ERROR: [wf error] Unable to resolve active conversation ID from harness environment.",
			  "ERROR: [wf error] Unable to resolve active conversation ID from harness environment.",
			  "ERROR: [wf error] Unable to resolve active conversation ID from harness environment.",
			]
		`);
	});

	it("runCli executes compile command on valid, invalid, and check formats", async () => {
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env: { PWD: process.cwd() },
		};

		// 1. Valid workflow with compile outputs JSON
		const resCompile = await runCli(["compile", "examples/weekend.md"], io);
		expect(resCompile.exitCode).toBe(0);
		expect(JSON.parse(outputs[0]).name).toBe("Weekend Readiness Protocol");

		// 2. Valid workflow with --check outputs validation summary without JSON
		const resCheck = await runCli(
			["compile", "examples/weekend.md", "--check"],
			io,
		);
		expect(resCheck.exitCode).toBe(0);

		// 3. Missing file
		const resMissing = await runCli(["compile"], io);
		expect(resMissing.exitCode).toBe(1);

		// 4. Nonexistent file
		const resNotFound = await runCli(["compile", "nonexistent-file.md"], io);
		expect(resNotFound.exitCode).toBe(1);

		// 5. Invalid workflow (condition without branch steps)
		const invalidFile = "/tmp/test-invalid-wf.md";
		fs.writeFileSync(invalidFile, "## If: Condition without branches\n");
		try {
			const resInvalid = await runCli(["compile", invalidFile, "--check"], io);
			expect(resInvalid.exitCode).toBe(1);
		} finally {
			if (fs.existsSync(invalidFile)) fs.unlinkSync(invalidFile);
		}

		expect(stripAbsolutePath(outputs.slice(1))).toMatchInlineSnapshot(`
			[
			  "[WORKFLOW VALID] "Weekend Readiness Protocol" is valid.
			Steps: 6 (3 linear, 2 condition, 1 gate)
			File: examples/weekend.md",
			  "ERROR: Missing required argument: <workflow-file>",
			  "ERROR: Workflow file not found: "nonexistent-file.md".",
			  "ERROR: [WORKFLOW INVALID] Validation failed for "test-invalid-wf":
			  - [ERROR] Condition step "Condition without branches" has no YES branch steps.",
			]
		`);
	});

	it("runCli executes pure CLI workflow lifecycle: stop, start, show, next", async () => {
		const env = {
			ANTIGRAVITY_CONVERSATION_ID: testConversationId,
			PWD: process.cwd(),
		};
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env,
		};

		// 1. Stop when no workflow is running
		await runCli(["stop"], io);

		// 2. Next when no workflow is loaded
		await runCli(["next"], io);

		// 3. Start workflow
		await runCli(["start", "examples/sample-wf.json"], io);

		// 4. Show active workflow
		await runCli(["show"], io);

		// 5. Next step in workflow
		await runCli(["next"], io);

		// 6. Stop running workflow
		await runCli(["stop"], io);

		expect(stripAbsolutePath(outputs)).toMatchInlineSnapshot(`
			[
			  "[WORKFLOW STATUS] No workflow is currently running.",
			  "ERROR: No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.",
			  "ERROR: Workflow file not found: "examples/sample-wf.json".",
			  "[WORKFLOW STATUS]
			No workflow is currently loaded.",
			  "ERROR: No workflow is loaded. Start a workflow with 'wf start <workflow-file>'.",
			  "[WORKFLOW STATUS] No workflow is currently running.",
			]
		`);
	});

	it("runCli handles static show command and missing file errors", async () => {
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env: { PWD: process.cwd() },
		};

		const resValid = await runCli(["show", "examples/weekend.md"], io);
		expect(resValid.exitCode).toBe(0);

		const resInvalid = await runCli(["show", "nonexistent.json"], io);
		expect(resInvalid.exitCode).toBe(1);

		expect(stripAbsolutePath(outputs)).toMatchInlineSnapshot(`
			[
			  "[WORKFLOW VISUALIZATION: Weekend Readiness Protocol]
			Present the structure of workflow "Weekend Readiness Protocol" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0{{"<i>Is it past Friday 4:00 PM?</i>"}}
			    s1{{"<i>Is the git working directory clean?</i>"}}
			    s2[["🛑 Confirm Slack post"]]
			    s3["Announce on Slack"]
			    s4["Dirty working tree"]
			    s5["Still on the clock"]
			    s0 -->|Yes| s1
			    s0 -->|No| s5
			    s1 -->|Yes| s2
			    s1 -->|No| s4
			    s2 --> s3
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			- If: Is it past Friday 4:00 PM?
			  - If: Is the git working directory clean?
			    - Gate: Confirm Slack post [Approval Required]
			    - Step: Announce on Slack
			  - Else:
			    - Step: Dirty working tree
			- Else:
			  - Step: Still on the clock

			RULES:
			1. Do NOT read or inspect the workflow file ("examples/weekend.md") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			  "ERROR: Workflow file not found: "nonexistent.json".",
			]
		`);
	});

	it("runCli handles compile with warnings with and without --check", async () => {
		const tempFile = "/tmp/test-warn-wf.json";
		fs.writeFileSync(
			tempFile,
			JSON.stringify({
				name: "test-warn-wf",
				steps: [
					{
						type: "condition",
						title: "Check",
						condition: "Is active?",
						yes: {
							steps: [{ type: "step", title: "Yes", instruction: "Do yes" }],
						},
						no: { steps: [] },
					},
				],
			}),
		);
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env: { PWD: process.cwd() },
		};

		try {
			const resCheck = await runCli(["compile", tempFile, "--check"], io);
			expect(resCheck.exitCode).toBe(0);

			const resCompile = await runCli(["compile", tempFile], io);
			expect(resCompile.exitCode).toBe(0);

			expect(stripAbsolutePath(outputs)).toMatchInlineSnapshot(`
				[
				  "[WORKFLOW VALID] "test-warn-wf" is valid.
				Steps: 2 (1 linear, 1 condition, 0 gate)
				File: /tmp/test-warn-wf.json

				Warnings:
				  - [WARN] Condition step "Check" defines an empty NO branch.",
				  "ERROR: [WARN] Condition step "Check" defines an empty NO branch.",
				  "{
				  "name": "test-warn-wf",
				  "steps": [
				    {
				      "type": "condition",
				      "title": "Check",
				      "condition": "Is active?",
				      "yes": {
				        "steps": [
				          {
				            "type": "step",
				            "title": "Yes",
				            "instruction": "Do yes"
				          }
				        ]
				      },
				      "no": {
				        "steps": []
				      }
				    }
				  ]
				}",
				]
			`);
		} finally {
			if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
		}
	});

	it("runCli handles start errors, help fallback, and unknown commands", async () => {
		const env = {
			ANTIGRAVITY_CONVERSATION_ID: testConversationId,
			PWD: process.cwd(),
		};
		const outputs: string[] = [];
		const io = {
			stdout: (m: string) => outputs.push(m),
			stderr: (m: string) => outputs.push(`ERROR: ${m}`),
			env,
		};

		const resMissing = await runCli(["start"], io);
		expect(resMissing.exitCode).toBe(1);

		const resNotFound = await runCli(["start", "nonexistent.json"], io);
		expect(resNotFound.exitCode).toBe(1);

		const tempEmpty = "/tmp/test-empty-wf.json";
		fs.writeFileSync(tempEmpty, JSON.stringify({ name: "Empty", steps: [] }));
		try {
			const resEmpty = await runCli(["start", tempEmpty], io);
			expect(resEmpty.exitCode).toBe(1);
		} finally {
			if (fs.existsSync(tempEmpty)) fs.unlinkSync(tempEmpty);
		}

		const resShowNone = await runCli(["show"], io);
		expect(resShowNone.exitCode).toBe(0);

		const resNoCmd = await runCli([], io);
		expect(resNoCmd.exitCode).toBe(0);

		const resUnknown = await runCli(["foobar"], io);
		expect(resUnknown.exitCode).toBe(1);

		expect(stripAbsolutePath(outputs)).toMatchInlineSnapshot(`
			[
			  "ERROR: Missing required argument: <workflow-file>",
			  "ERROR: Workflow file not found: "nonexistent.json".",
			  "ERROR: Workflow file "/tmp/test-empty-wf.json" does not contain any steps.",
			  "[WORKFLOW STATUS]
			No workflow is currently loaded.",
			  "wf - Workflow Runner CLI

			Usage:
			  wf hook <event>       Execute harness lifecycle hook (pre, stop)
			  wf compile <file>     Compile workflow to JSON
			  wf start <file>       Start a workflow from a Markdown or JSON file
			  wf show [<file>]      Show workflow status, mermaid diagram, and current step
			  wf next               Execute the next step of a paused workflow
			  wf stop               Stop and reset the active workflow
			  wf help               Show this help reference

			Options:
			  --check               Validate workflow without outputting JSON
			  -h, --help            Show help
			  -v, --version         Show version",
			  "ERROR: Unknown command: "foobar". Run "wf --help" for available commands.",
			]
		`);
	});
});
