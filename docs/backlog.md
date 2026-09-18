# `wf` Plugin — Project Backlog

This backlog tracks architectural improvements, essential fixes, and high-leverage feature additions required to make `wf` a production-ready, easily distributable Antigravity (AGY) plugin.

---

## Priority 1: Plugin Packaging & Architecture (Foundational)

These items address structural and environment-specific constraints to ensure `wf` conforms to the AGY plugin specification and runs reliably when installed globally or across projects.

### [x] 1.1 Standalone Zero-Dependency Bundle (`esbuild`)
- **Current State:** `.agents/plugins/wf/hooks.json` references `"command": "node ../../../main.ts pre"`. This requires Node 23+ (or experimental TypeScript flags) and expects `node_modules` in the parent repository. Installing the plugin globally (`~/.gemini/config/plugins/wf`) or in an external project fails.
- **Objective:** Add an `esbuild` build script (`npm run build`) that bundles `main.ts` and all AST dependencies into a single, self-contained `dist/index.cjs` (or `dist/index.mjs`).
- **Changes Needed:**
  - Add `esbuild` to `devDependencies`.
  - Add build script to `package.json`.
  - Update `hooks.json` to invoke `node ./dist/index.cjs pre` and `node ./dist/index.cjs stop`.

### [x] 1.2 Remove Dead `PostInvocation` Hook
- **Current State:** `hooks.json` registers `PostInvocation` with `node ../../../main.ts post`, but `main.ts` explicitly drops anything other than `pre` and `stop` (`if (modeArg !== "pre" && modeArg !== "stop") return;`).
- **Objective:** Eliminate unnecessary process spawns on every tool invocation.
- **Changes Needed:**
  - Remove the `PostInvocation` block from `hooks.json`.

### [x] 1.3 Plugin Distribution & Repository Layout
- **Current State:** Plugin metadata (`plugin.json`, `hooks.json`, `skills/`) lives inside `.agents/plugins/wf/`, while the source and package files live at the repository root.
- **Objective:** Align with standard AGY plugin distribution patterns (such as `ponytail`) so the repository can be directly cloned or symlinked into `~/.gemini/config/plugins/wf` or `<repo>/.agents/plugins/wf`.
- **Changes Needed:**
  - Establish a unified root layout or an automated packaging command (`npm run pack:plugin`) that generates a clean release bundle.

### [x] 1.4 Plugin Guidelines (`rules/AGENTS.md`)
- **Current State:** Root `AGENTS.md` is empty and no plugin rules are defined.
- **Objective:** Ship `rules/AGENTS.md` with the plugin to orient the model whenever the plugin is active.
- **Content to Include:**
  - Enforcement of step-by-step execution: strictly execute only the active injected step.
  - Ban reading raw workflow files (prevent context duplication).
  - Proper condition termination tokens (`[DECISION: YES]` / `[DECISION: NO]`).
  - Help text for workflow commands (`/wf`, `/wf-show`, `/wf-next`, `/wf-stop`, `/wf-help`).

### [x] 1.5 Namespaced Hook Subcommands (`wf hook pre`, `wf hook stop`)
- **Current State:** Lifecycle hooks are namespaced under `wf hook pre` and `wf hook stop` via standard library `node:util` `parseArgs`. Pure CLI commands (`wf stop`, `wf show`, `wf next`, `wf start`) operate independently without protocol pollution.
- **Objective:** Move all harness hook-related invocations under a dedicated `wf hook` subcommand namespace (`wf hook pre`, `wf hook stop`).
- **Changes Needed:**
  - Update the CLI entrypoint/router to parse `wf hook <event>` and dispatch to `runShim(event)`.
  - Update `hooks/claude-codex-hooks.json` and AGY hook manifests to invoke `wf hook pre` and `wf hook stop`.
  - Ensure pure CLI commands (`wf start`, `wf next`, `wf show`, `wf stop`) remain distinct, clean, and unpolluted by internal protocol handlers.

---

## Priority 2: Core Workflow Capabilities (Functionality)

These items expand the engine's capabilities to handle real-world, non-trivial engineering workflows.

### [ ] 2.1 Workspace Workflow Discovery & Menu (`/wf` / `/wf-list`)
- **Current State:** Running `/wf` without an argument returns a raw error: `Missing required argument: <workflow-file>`.
- **Objective:** When `/wf` is executed without arguments (or via `/wf-list`), scan the workspace for workflow files and present an interactive, formatted list.
- **Search Paths:**
  - `./workflows/**/*.{md,json}`
  - `.agents/workflows/**/*.{md,json}`
  - `.workflows/**/*.{md,json}`
  - Plugin-bundled workflow directory.
- **Output:** Table or list with workflow file path, name, and frontmatter description.

### [ ] 2.2 Dynamic Arguments & Variable Interpolation (`/wf <file> [args]`)
- **Current State:** Workflows are completely static; inputs cannot be parameterized without modifying markdown files before every run.
- **Objective:** Support arguments on the command line and interpolate them into step instructions and preambles, or inject unstructured user instructions directly into the workflow context.
- **Usage:**
  - Named arguments: `/wf deploy.md env=staging tag=v1.2.0`
  - Positional arguments: `/wf review.md 142`
  - Freeform user instructions: `/wf review-pr.md focus on performance bottlenecks and SQL query safety`
  - Delimited mode: `/wf deploy.md env=staging -- abort immediately if any error occurs`
- **Specification:**
  - Support YAML frontmatter declaring expected inputs and defaults:
    ```markdown
    ---
    name: Deployment
    inputs:
      env:
        description: Target environment
        default: staging
    ---
    ```
  - Replace occurrences of `{{env}}` or `$1` across step instructions during workflow compilation.
  - **Freeform User Instructions Pass-Through (Unparameterized / Passthrough Mode):**
    - If a workflow defines **no parameters** (`inputs` field is omitted or empty), or if a **special mode / delimiter** is activated (e.g. `-- <user_instructions>` or frontmatter setting `freeform: true`), the entire string after `/wf <file> <user_instructions>` is captured as raw user instructions.
    - **Injection Behavior:** The captured string is injected into the model context **once at the beginning of the workflow** (appended to the workflow preamble / initial step prompt) under a dedicated section (e.g. `### Additional User Instructions:`), providing flexible runtime steering without requiring upfront parameter definitions.

### [x] 2.3 Human-in-the-Loop Gates (`Gate:` / Interactive Approval)
- **Current State:** Implemented. Workflow authors define explicit human verification checkpoints via `## Gate: <title>`.
- **Objective:** Allow workflow authors to define explicit human verification checkpoints (e.g. before schema migrations or production deploys).
- **Specification:**
  - Gate step syntax:
    ```markdown
    ## Gate: Approve migration plan
    Review the proposed database schema changes above. Confirm execution?
    ```
  - When reaching a gate, the runner pauses execution, surfaces the confirmation prompt to the user, and waits for explicit user confirmation (`/wf-next` or approval response) before proceeding.

### [ ] 2.4 Execution Resilience: Step Retry & Jump (`/wf-retry`, `/wf-jump <step>`)
- **Current State:** A failure at step 7 of an 8-step workflow forces the workflow into `error` status with no recourse except `/wf-stop` and restarting from step 1.
- **Objective:** Provide granular recovery controls.
  - `/wf-retry`: Re-injects the current step instruction without advancing the step index.
  - `/wf-jump <stepNum>`: Directly modifies `currentStepIndex`, allowing the user to skip broken steps or re-run a previous milestone.

### [ ] 2.5 Agent & Terminal CLI Mode (`wf next`, `wf show --mermaid`)
- **Current State:** Workflows are controlled exclusively through chat slash commands (`/wf`, `/wf-next`, `/wf-show`, `/wf-stop`). AI agents (Antigravity, Claude Code, Codex, or subagents) cannot trigger slash commands directly because slash commands are strictly user-facing chat inputs intercepted at `PreInvocation`/`UserPromptSubmit`. Consequently, an agent cannot advance workflow steps, inspect the active step, or query the workflow diagram autonomously via tool execution.
- **Objective:** Provide a standalone CLI executable (`wf`) so both human developers in the terminal and autonomous AI agents (via `run_command` / bash) can control, advance, and inspect workflows programmatically.
- **Commands & Usage:**
  - `wf next [--decision YES|NO]`: Advance to the next workflow step and output the step's prompt/instructions to stdout. For conditional steps, accepts branch decisions.
  - `wf show [--mermaid] [--json]`: Output the current workflow status, step progress, or the raw Mermaid graph (`--mermaid`) for visualization or agent graph analysis.
  - `wf status [--json]`: Machine-readable JSON or tabular summary of the active workflow (active step index, total steps, workflow name, status, variables).
  - `wf start <workflow-file> [args]`: Compile and initiate a new workflow run from the command line, enabling agent-driven multi-step orchestration.
  - `wf stop`: Abort and clean up the active workflow state.
- **Architecture & Session Resolution:**
  - **Unified Core:** Reuses the existing TypeScript core engine (`src/wf.ts`, `src/state.ts`, `src/mermaid.ts`) rather than re-implementing workflow logic.
  - **Session Detection:** Resolves the active conversation state using environment variables (`WF_CONVERSATION_ID`, `AGY_CONVERSATION_ID`, `CLAUDE_CONVERSATION_ID`) or workspace-scoped state file fallbacks.
  - **Dual-Control Parity:** Chat slash commands and CLI invocations operate on identical persistent state files, allowing seamless handoffs between user chat triggers and agent CLI commands.

### [ ] 2.6 Decision Mechanism Spike: Explicit CLI Dispatch vs. Output Token Parsing
- **Current State:** Conditional branch steps (`[DECISION: YES]` / `[DECISION: NO]`) rely on heuristic regex parsing of raw model response text during `Stop` / `PostInvocation` hook events (`parseDecision(modelText)` in `src/actions/formatters.ts`).
- **Problems with Output Text Parsing:**
  - **Formatting Fragility:** Conversational explanations, markdown formatting variations (e.g. bolding, code fences), or hallucinated examples can cause regex mismatches, defaulting unexpectedly to `NO` or misbranching.
  - **Transcript Extraction Overhead:** Requires reading and parsing session transcripts (`transcriptPath` in AGY) at hook execution time, introducing harness-specific file parsing logic.
  - **Prompt Pollution:** Forces prompt injection instructions to constantly remind the model of strict token placement at the end of its response.
  - **No Immediate Validation:** The model receives no feedback if its decision token was omitted, unparseable, or ambiguous until the hook fails or chooses an unintended path.
- **Proposed Exploration: Explicit CLI Decision Command (`wf decide <YES|NO>` or `wf next --decision <YES|NO>`):**
  - Have the agent invoke an explicit CLI command (`wf decide YES` / `wf next --decision YES`) via `run_command` upon evaluating conditions.
  - **Advantages:**
    - **Deterministic Control:** Strong type and argument validation replaces heuristic string pattern matching.
    - **Synchronous Feedback:** Command stdout immediately returns the newly activated branch step, eliminating multi-stage hook roundtrips.
    - **Harness-Agnostic:** Operates through standard shell execution, decoupling decision handling from harness-specific transcript formats.
    - **Auditability:** The decision is recorded as a discrete, structured tool call in the conversation timeline.
  - **Trade-offs / Constraints:**
    - Requires tool execution permissions (`run_command` / bash); cannot work in tool-less or pure chat scenarios.
    - Introduces tool invocation latency compared to passive text completion.
- **Evaluation Criteria & Hybrid Recommendation:**
  - Benchmark decision reliability across models (Gemini, Claude, GPT) using CLI dispatch vs. regex token parsing.
  - Prototype a **hybrid fallback**: Agent CLI invocation takes precedence when available, with passive token parsing retained as a backward-compatible fallback for restricted or tool-less environments.

### [ ] 2.7 State Overwrite Guard (`--overwrite` / `--force` for Non-Linear State Mutations)
- **Current State:** Workflow state transitions currently occur without collision protection. Launching a new workflow via `/wf <file>` or `wf start <file>` immediately wipes out an active in-flight session. Planned features like `/wf-jump <step>` (Item 2.4) or unprompted condition overrides allow agents or users to bypass DAG integrity, skip mandatory verification gates, or discard progress without explicit confirmation.
- **Objective:** Enforce an explicit `--overwrite` (or `--force`) flag for any operation that discards, resets, or non-linearly mutates the active workflow state.
- **Classification of Actions:**
  - **Standard Progression (No `--overwrite` required):**
    - `wf next` on standard sequential steps.
    - `wf next --decision <YES|NO>` on condition evaluation steps (following normal graph branching).
    - Answering human verification checkpoints ([gate]).
    - `wf stop` (graceful cancellation).
  - **Destructive / Non-Linear Mutations (Strictly REQUIRES `--overwrite`):**
    - **Starting over an active workflow:** Running `wf start <new-file> --overwrite` (or `/wf <new-file> --overwrite`) when `status` is `"active"` or `"paused"`.
    - **Arbitrary step jumping:** `wf jump <stepNum> --overwrite` (or `/wf-jump <stepNum> --overwrite`) to prevent accidental DAG skips.
    - **Condition / gate bypass:** Calling `wf next` without a decision on a condition step, or attempting to force-skip an unresolved gate checkpoint.
    - **Session reset / state rewrite:** Hard resets or clearing session variables mid-run.
- **Behavior on Missing Flag:**
  - **CLI:** Exits with code `1` and machine-readable error payload:
    ```json
    {
      "error": "StateOverwriteError",
      "message": "Workflow 'Deploy Service' is currently active at step 3/6. Pass '--overwrite' to forcefully replace or jump state."
    }
    ```
  - **Chat / Hook:** Blocks execution and injects an actionable system prompt instructing the user/agent: `"An active workflow is currently running. Re-run the command with '--overwrite' to confirm discarding current progress."`

### [ ] 2.8 Workflow Schema & Semantic Validation
- **Current State:** The workflow parser (`src/md-parser.ts`, `src/actions/run.ts`) assumes structurally well-formed input and primarily handles AST mapping. Files that are completely empty, workflows with no actionable steps, conditional branches with missing steps, or gate steps without verification prompts either silently compile degenerate flat step graphs (e.g. empty target jumps) or lead to unpredictable execution errors mid-run.
- **Objective:** Introduce a dedicated validation layer (`validateWorkflow(def: WorkflowDef): ValidationResult`) that verifies all required fields are present and enforces semantic graph integrity before a workflow definition is processed.
- **Validation Rules & Integrity Checks:**
  - **Required Structural Fields:**
    - **Workflow Name:** Workflow must declare a valid, non-empty name (via YAML frontmatter `name`, top-level `# H1` heading, or file name fallback).
    - **Step Presence:** Workflow must contain at least one actionable step (`steps.length > 0`). Empty files or files with only preambles/frontmatter fail validation.
    - **Action Steps:** Action steps must contain non-empty instruction text.
    - **Conditional Steps:** Condition steps must define a non-empty `condition` expression and a non-empty `yes` branch.
    - **Gate Steps:** Human verification checkpoints must define a non-empty instruction/prompt explaining what the user is approving.
  - **Semantic Graph Integrity Checks:**
    - **Empty Branches:** Detect and flag `if` blocks with no nested steps or explicit `else` blocks that contain no actionable instructions.
    - **Unreachable / Orphan Steps:** Detect disconnected branches, malformed heading hierarchies (e.g. unexpected heading depth skips), or dead paths.
    - **Circular / Invalid References:** If step IDs are defined, verify ID uniqueness and ensure any jump or skip targets resolve to existing steps.
    - **Missing Fallbacks:** Warn or flag conditional branches that lack fallback paths when required.
- **Diagnostic Output (`ValidationResult`):**
  - Return structured diagnostics distinguishing between `error` (fatal; blocks workflow compilation) and `warning` (advisory lint / code smell).
  - Diagnostic payload includes error code, human-readable message, step identifier/heading title, and source position (line/offset) when available from the AST.
- **Integration & Tooling Alignment:**
  - Reusable core validator in `src/` that can be invoked at compile/load time.
  - Serves as the shared engine for the pre-flight static linter described in **Item 3.2** (`/wf-lint <file>` / `wf lint <file>`).

### [ ] 2.9 Alphanumeric Step Title Prefixes (`1a`, `1b`, `Step 1a:`)
- **Current State:** Heading parsing (`src/md-parser.ts`) strips leading non-letter characters (`^[^\p{L}]+`) to detect keywords (`if`, `else`, `gate`) after simple numeric prefixes like `1.` or `2.`. When titles use alphanumeric prefixes like `1a`, `1b`, or `Step 1a:` (number followed by letters):
  - Stripping non-letters stops at the letter (e.g. `1a` becomes `a`), which breaks keyword detection when combined with prefix words (e.g. `Step 1a: If ...`), or leaves stray letters.
  - Step titles preserve raw prefixes inconsistently depending on whether keywords are present.
- **Objective:** Support alphanumeric step prefixes such as `1a`, `1b`, `2a`, `2b` (numbers followed by letters), as well as prefixed variants (`Step 1a:`, `Task 1b:`, `1a.`, `1b)`):
  - Reliably recognize keyword headings (`if`, `else`, `gate`) regardless of whether steps use numeric (`1.`), alphanumeric (`1a.`, `1b:`), or worded prefixes (`Step 1a:`).
  - Cleanly separate the alphanumeric prefix from the step title/condition for consistent display and indexing.
- **Changes Needed:**
  - Enhance prefix pattern matching in `src/md-parser.ts` to recognize alphanumeric sequences (`\d+[a-zA-Z]+`) alongside optional prefix labels (`Step`, `Task`, `Schritt`).
  - Add test fixtures and unit tests in `src/md-parser.test.ts` covering `1a`, `1b`, `1a. If ...`, `1b. Gate: ...`, and regular steps with alphanumeric numbering.

### [ ] 2.10 Mandatory Colon Delimiter for Control Keywords (`If:`, `Else:`, `Gate:`)
- **Current State:** Heading keyword detection in `src/md-parser.ts` accepts whitespace as a keyword delimiter (`(?:[:\s]+(.*))?`). Consequently, natural language titles beginning with a keyword followed by a space (e.g., `## If is friday`, `## Gate the release`, `## No dependencies needed`) are unintentionally parsed as control-flow constructs (`if`, `gate`, `else`) rather than plain action steps.
- **Objective:** Require a trailing colon (`:`) immediately following control keywords (`If:`, `Else:`, `Gate:`) to activate control-flow parsing. Any heading lacking a colon must be treated as a standard plain-text action step.
- **Syntax Rules:**
  - **Control-flow headings (colon mandatory):**
    - `## If: is friday` (conditional branch)
    - `## Else:` or `## Else: fallback actions` (else/fallback branch)
    - `## Gate: Approve deployment` (human verification gate)
  - **Standard action steps (no colon):**
    - `## If is friday` -> Plain step titled `"If is friday"`
    - `## Gate release candidate` -> Plain step titled `"Gate release candidate"`
    - `## No dependencies required` -> Plain step titled `"No dependencies required"`
- **Benefits:**
  - **Collision Prevention:** Eliminates ambiguity between control structures and natural language headings as the keyword set expands.
  - **Deterministic Grammar:** Makes workflow parsing predictable and robust across varied heading styles.
- **Changes Needed:**
  - Update `KEYWORD_REGEX` in `src/md-parser.ts` to require a colon delimiter after the keyword.
  - Update existing test fixtures to adhere to mandatory colon syntax where branching is tested.
  - Add test assertions verifying that keyword words followed by spaces without colons remain standard action steps.

### [ ] 2.11 Claude Code Namespaced Command Normalization (`/wf:wf`, `/wf:wf-*`)
- **Current State:** The slash command parser (`src/lib/parseCommand.ts`) expects root slash commands matching `/^\/(wf-(?:status|next|stop|help|show)|wf)\b/`. In Claude Code, plugins installed from marketplaces automatically namespace registered skills/commands under the plugin name, resulting in prefixed invocations such as `/wf:wf <file>`, `/wf:wf-show`, `/wf:wf-next`, `/wf:wf-stop`, `/wf:wf-help` (as well as potential short forms like `/wf:show`, `/wf:next`). Currently, `/wf:wf deploy.md` causes the parser to treat `:wf` as the target file path, and `/wf:wf-show` fails to be recognized as a valid `wf` command.
- **Objective:** Support both native root slash commands (`/wf`, `/wf-show`, `/wf-next`) and Claude Code namespaced commands (`/wf:wf`, `/wf:wf-show`, `/wf:wf-next`, `/wf:show`, `/wf:next`) seamlessly without breaking command routing or file path extraction.
- **Investigation & Solutions:**
  1. **Tolerant Inbound Normalization in `parseCommand.ts`:**
     - Update the command matcher regex in `src/lib/parseCommand.ts` to optionally match and strip the `wf:` plugin namespace prefix:
       - Match pattern: `^\/(?:wf:)?(wf-(?:show|next|stop|help)|wf)\b`
       - Also support short namespaced forms: `^\/wf:(show|next|stop|help|run)\b`
     - Map namespaced variants to canonical internal command names (`run`, `show`, `next`, `stop`, `help`).
  2. **Claude Code Harness Normalizer (`src/shim/normalizer.ts`):**
     - Normalize prompt text in the ingress shim layer when Claude Code is detected (`detectHarness() === "claude_code"`), ensuring clean decoupled parsing before dispatch.
  3. **Help & Documentation Parity:**
     - Update `/wf-help` / `getHelpText()` and `README.md` to document both standard slash syntax and Claude Code namespaced command forms.
- **Changes Needed:**
  - Update `src/lib/parseCommand.ts` regex and routing logic to accept `wf:` prefixed commands.
  - Add test cases to `src/lib/parseCommand.test.ts` covering `/wf:wf deploy.md`, `/wf:wf-show`, `/wf:wf-next`, `/wf:show`, `/wf:next`, etc.

### [ ] 2.12 Standalone Session Resolution & Explicit Conversation Override (`-c` / `--conversation-id` / Multi-Harness State Discovery)
- **Current State:** CLI commands interacting with active state (`wf start`, `wf next`, `wf stop`, `wf show`) strictly rely on harness environment variables (`resolveConversationIdFromHarnesses`). If no harness environment is detected (e.g. human developer running commands directly in terminal bash/zsh outside an agent shell), the CLI hard exits with code `1`.
- **Objective:** Enable flexible standalone and multi-harness terminal workflows:
  - **Explicit Conversation Flag:** Add `-c <id>` / `--conversation-id <id>` to CLI argument parsing so developers or external scripts can target a specific conversation state explicitly.
  - **Multi-Harness State Discovery:** When no harness environment variable and no `-c` flag is present, inspect `/tmp/wf-state-*.json` or harness session directories (e.g. `CLAUDE_PLUGIN_DATA`) to find the most recently modified active workflow state file and adopt it automatically.
  - **Active Session List / Selector:** If multiple active state files are found, surface a selectable list or prompt in interactive terminals.

---


## Priority 3: Antigravity 2.0 Integration & Tooling (Polish)

### [ ] 3.1 Live Sidebar Progress Tracking Artifact (`workflow-progress.md`)
- **Current State:** Workflow progress is only queried via `/wf-show`.
- **Objective:** Leverage Antigravity's Artifact Sidebar by maintaining an active progress artifact in `artifactDirectoryPath`.
- **Output:** A real-time checklist updating on every step transition:
  ```markdown
  # Workflow: Deploy Service
  **Status:** Active | **Step:** 3 / 6

  - [x] Step 1: Run linter and typecheck
  - [x] Step 2: Build release binaries
  - [ ] **Step 3: Run smoke tests against staging** *(In Progress)*
  - [ ] Step 4: [Gate] Approve production deploy
  - [ ] Step 5: Execute production deploy
  - [ ] Step 6: Verify health endpoints
  ```

### [ ] 3.2 Workflow Static Linter (`/wf-lint <file>`)
- **Current State:** Markdown syntax or AST errors are only reported when attempting to run the workflow.
- **Objective:** Provide a pre-flight validator to inspect workflows for unreachable branches, circular jump loops, or malformed markdown headers before execution (leveraging the validation engine from Item 2.8).

### [ ] 3.3 Out-of-the-Box Standard Workflow Library
- **Current State:** Only `examples/sample-wf.md` is provided.
- **Objective:** Bundle ready-to-use workflows within the plugin:
  - `review-pr.md`: PR review workflow checking diffs, test coverage, and security implications.
  - `release-preflight.md`: Automated checks for uncommitted files, changelogs, and passing tests before tag creation.
  - `refactor-module.md`: Structured plan-test-refactor-verify loop.

---

## Priority 4: Multi-Harness Validation, NPM Packaging & CI/CD

These items automate multi-harness quality assurance, prevent manifest version drift across ecosystems, and establish distribution through NPM and GitHub Actions.

### [ ] 4.1 Manifest Schema & Version Consistency Guards
- **Current State:** Manifest versions across `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` must be kept in sync manually.
- **Objective:** Provide automated pre-release validation scripts:
  - `scripts/check-versions.js`: Asserts that `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.agents/plugins/wf/plugin.json` share identical version numbers.
  - `scripts/check-schemas.js`: Validates all manifests and `marketplace.json` catalogs against official schemas.
  - Add `npm run validate` to `package.json`.

### [ ] 4.2 NPM Distribution & Zero-Config CLI Installer (`bin/cli.cjs`)
- **Current State:** Installing `wf` into external agent directories requires manual directory copying or git cloning.
- **Objective:** Support one-command installation via NPM (`npx @your-org/wf init`):
  - Configure `files` whitelist in `package.json` to publish only production artifacts (`dist/`, `skills/`, `rules/`, `hooks/`, manifests, `AGENTS.md`).
  - Add `"bin": { "wf-agent": "./bin/cli.cjs" }` to `package.json`.
  - Author `bin/cli.cjs`: An interactive/scriptable CLI installer that automatically symlinks or installs the plugin to `~/.gemini/config/plugins/wf`, Claude Code, or Codex.

### [ ] 4.3 Multi-Harness GitHub Actions CI/CD Pipeline
- **Current State:** Tests and bundle builds are only run manually on local developer machines.
- **Objective:** Automate PR validation and multi-registry publishing:
  - `.github/workflows/test.yml`: Runs `vitest run`, standalone bundle compilation, version consistency check, and schema validation on every pull request.
  - `.github/workflows/release.yml`: Triggers on git tags (`v*`), builds the self-contained production bundle, and publishes to NPM with OIDC provenance.

