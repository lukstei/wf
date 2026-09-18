import * as fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getCliHelp, parseCliArgs, runCli } from "./cli.ts";
import { stripAbsolutePath } from "./test-utils.ts";

describe("src/cli.ts", () => {
	const testConversationId = "test-cli-suite";

	beforeEach(() => {
		const stateFile = `/tmp/wf-state-${testConversationId}.json`;
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
		const resCompile = await runCli(["compile", "examples/sample-wf.json"], io);
		expect(resCompile.exitCode).toBe(0);
		expect(JSON.parse(outputs[0]).name).toBe("Sample Automated Workflow");

		// 2. Valid workflow with --check outputs validation summary without JSON
		const resCheck = await runCli(
			["compile", "examples/sample-wf.json", "--check"],
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
			  "[WORKFLOW VALID] "Sample Automated Workflow" is valid.
			Steps: 5 (4 linear, 1 condition, 0 gate)
			File: examples/sample-wf.json",
			  "ERROR: Missing required argument: <workflow-file>",
			  "ERROR: Workflow file not found: "nonexistent-file.md".",
			  "ERROR: [WORKFLOW INVALID] Validation failed for "test-invalid-wf":
			  - [ERROR] Condition step "Condition without branches" has no YES branch steps.

			Warnings:
			  - [WARN] Workflow lacks a description in YAML frontmatter.",
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
			  "[WORKFLOW STARTED] "Sample Automated Workflow"
			Step 1/5: Report Current Status
			State that Workflow Step 1 is starting. Output a single sentence confirming readiness.",
			  "[WORKFLOW STATUS: ACTIVE]
			Workflow: Sample Automated Workflow
			Step: 1 of 5 (Nesting Level 0)

			[WORKFLOW VISUALIZATION: Sample Automated Workflow]
			Present the structure of workflow "Sample Automated Workflow" to the user.

			If your environment supports rendering Mermaid diagrams, visualize it using:
			\`\`\`mermaid
			flowchart TD
			    s0["▶ Report Current Status"]
			    s1{{"<i>Check Day Condition</i>"}}
			    s2["Report Friday Status"]
			    s3["Report Non-Friday Status"]
			    s4["Verify and Conclude"]
			    s0 --> s1
			    s1 -->|Yes| s2
			    s1 -->|No| s3
			    s2 --> s4
			    s3 --> s4
			    style s0 stroke:#3b82f6,stroke-width:4px
			\`\`\`

			If Mermaid rendering is not supported in the current interface, show the plain text representation instead:

			▶ [CURRENT] - Step: Report Current Status
			- If: Check Day Condition
			  - Step: Report Friday Status
			- Else:
			  - Step: Report Non-Friday Status
			- Step: Verify and Conclude

			RULES:
			1. Do NOT read or inspect the workflow file ("examples/sample-wf.json") or SKILL.md — steps are already loaded by the runner.
			2. Do NOT execute any workflow steps. This is strictly an informational visualization.",
			  "[STEP 1/5] Report Current Status
			State that Workflow Step 1 is starting. Output a single sentence confirming readiness.",
			  "[WORKFLOW STOPPED] Workflow "Sample Automated Workflow" has been stopped.",
			]
		`);
	});
});
