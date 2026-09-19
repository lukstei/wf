# `wf` Plugin — Project Backlog

## Backlog Format Guidelines

- **Indexing:** Number all items sequentially starting from 1 (`### [ ] 1. <Title>`).
- **Current State:** Analyzed and concisely described based on the current codebase.
- **Objective:** Concise description of the goal.
- **Agent Triage:** Max 1–3 lines. Ideas, considerations, or edge cases from the agent. Keep writing concise. No implementation outlines, no pre-planning.

---

### [ ] 1. Workspace Workflow Discovery & Interactive Menu (`/wf`, `/wf-list`)
- **Current State:** Invoking `/wf` without an argument fails with `Missing required argument: <workflow-file>`. Users must specify exact relative paths manually.
- **Objective:** Scan workspace directories for `.md` and `.json` workflow files when `/wf` runs without arguments (or via `/wf-list`), presenting an interactive picker.
- **Agent Triage:** Hook into `defaultWorkflowResolver` workspace paths. Bound directory search depth and ignore `node_modules` so discovery stays fast in large repositories.

### [ ] 2. Dynamic Arguments & Variable Interpolation (`/wf <file> [args]`)
- **Current State:** Workflows are static. The command parser rejects or drops trailing arguments, and step formatters have no parameter replacement or runtime instruction injection.
- **Objective:** Accept named (`key=value`), positional, and freeform trailing arguments in `/wf`, interpolating values into step templates or appending unstructured instructions to the initial step prompt.
- **Agent Triage:** Separate structured variable replacements from raw freeform prompt text. Keep delimiter syntax simple (e.g. `--`) to avoid parsing ambiguities with file paths.

### [ ] 3. Execution Resilience: Step Retry & Jump (`/wf-retry`, `/wf-jump <step>`)
- **Current State:** When a step fails, the workflow enters `error` status with no recourse except `/wf-stop` and restarting from step 1.
- **Objective:** Add `/wf-retry` to re-execute the active step without advancing, and `/wf-jump <step>` to move the execution pointer to a target step index or title.
- **Agent Triage:** Jumping across condition branches or gates risks invalidating workflow state. Enforce bounds checking and state validation in `transitions.ts` before updating the step pointer.

### [ ] 4. Decision Mechanism Spike: Explicit CLI Dispatch vs. Output Token Parsing
- **Current State:** Conditional branching parses `[DECISION: YES]` and `[DECISION: NO]` tokens from assistant output via regex in `formatters.ts`.
- **Objective:** Evaluate replacing token parsing with explicit tool or CLI commands (`wf decide <YES|NO>` or `wf next --decision <YES|NO>`) called by the model.
- **Agent Triage:** Token parsing is harness-agnostic but vulnerable to model formatting drift. Explicit CLI commands are deterministic but require shell execution permissions and add tool call latency.

### [ ] 5. State Overwrite Guard (`--overwrite` / `--force` for Active Sessions)
- **Current State:** Starting a workflow via `actions/run.ts` or `cli.ts` immediately replaces active session state without checking if another workflow is already running.
- **Objective:** Guard active workflows against accidental overwrites by prompting for confirmation or requiring an explicit `--overwrite` or `--force` flag.
- **Agent Triage:** Non-interactive agent runs cannot respond to interactive terminal prompts. Fall back to clean error exits that instruct the user to supply `--overwrite`.

### [ ] 6. Alphanumeric Step Title Prefixes (`1a`, `1b`, `Step 1a:`)
- **Current State:** `stripLeading` in `src/lib/markdown/wf.ts` strips leading non-letter characters (`^[^\p{L}]+`), mishandling alphanumeric labels like `1a.` or `1a: If:` before keyword matching.
- **Objective:** Support alphanumeric step prefixes (`1a`, `1b`, `Step 1a:`) while recognizing control keywords (`If:`, `Gate:`, `Else:`) and keeping titles clean.
- **Agent Triage:** Keep regex modifications in `wf.ts` narrow. Verify existing numeric prefixes (`1.`, `2.`) and snapshot tests in `parsing.test.ts` remain intact.

### [ ] 7. Multi-Harness Namespaced Command Normalization (`/wf:wf`, `/wf:wf-*`)
- **Current State:** `parseCommand` matches slash, mention, and codex prefixes, but harness-specific namespaces (such as Claude plugin colon syntax `/wf:run` or Codex `$wf:wf-*`) lack complete test coverage and uniform normalization.
- **Objective:** Normalize all harness-specific command formats across Claude Code, Antigravity, Codex CLI, and GitHub Copilot into canonical runner actions.
- **Agent Triage:** Keep normalization logic centralized in `src/lib/parseCommand.ts`. Add matrix snapshot tests covering every harness's slash and colon variants.

### [ ] 8. Standalone Session Resolution & Explicit Conversation Override (`-c`, `--conversation-id`)
- **Current State:** Stateful CLI commands exit with code 1 when executed outside an active agent session because harness environment variables are absent.
- **Objective:** Add `-c` / `--conversation-id` CLI flags and fall back to discovering the most recently modified active state file in `/tmp/` or plugin storage.
- **Agent Triage:** Restrict state file discovery to valid active sessions. Stale or corrupted JSON files must be skipped without crashing the CLI.

### [ ] 9. Configurable Preamble Injection Mode (`preamble_mode: always | once`)
- **Current State:** Global preamble markdown is injected into every step prompt and continuation reason under `CONTEXT:`, accumulating tokens across long sessions.
- **Objective:** Add a `preamble_mode` frontmatter option (`always` default, `once` opt-in) to restrict global preamble injection to the first step prompt.
- **Agent Triage:** Omitting preambles on later steps risks instruction drift in compacting agent windows. Keep `always` as the default setting.

### [ ] 10. Chained Conditional Branching (`Else If:`, `Elif:`)
- **Current State:** The parser only supports binary `If:` and `Else:` structures; multi-way branches require nesting conditions under child headings at deeper indentation levels.
- **Objective:** Support `Else If: <condition>` and `Elif: <condition>` at the same heading depth as the parent `If:` to allow flat sequential decision chains.
- **Agent Triage:** AST flattening must resolve jump indices correctly so an executed branch skips all remaining sibling `Else If:` and `Else:` steps.

### [ ] 11. Hierarchical Step Grouping & Sub-Steps (Non-Conditional Nesting)
- **Current State:** Subheadings under a linear action step are treated as body text within that step, executing as one monolithic prompt instead of discrete sequential steps.
- **Objective:** Compile subheadings under action steps into sequential sub-steps with parent context injection and visual grouping in Mermaid diagrams.
- **Agent Triage:** Affects step flattening, Mermaid subgraph generation, and progress indexing. Ensure step counting (`Step X of Y`) reflects discrete sub-steps cleanly.

### [ ] 12. Live Sidebar Progress Tracking Artifact (`workflow-progress.md`)
- **Current State:** Workflow progress is visible only through explicit `/wf-show` invocations or terminal output.
- **Objective:** Automatically write and update a `workflow-progress.md` artifact in the harness artifact directory to render step progress and Mermaid diagrams in the sidebar.
- **Agent Triage:** Check whether the active harness defines an artifact directory before writing. Throttle file updates to prevent excessive disk I/O.

### [ ] 13. Workflow Static Linter (`/wf-lint <file>`)
- **Current State:** Syntax validation exists via `wf compile --check`, but there is no dedicated `/wf-lint` slash command and structural checks for unreachable or circular paths are missing.
- **Objective:** Introduce `/wf-lint` with checks for unreachable branches, missing targets, orphaned gates, and malformed headings before execution.
- **Agent Triage:** Build on existing `validator-checks.ts` diagnostics. Keep linter output format aligned with standard compiler errors (line numbers, problem codes, and clear fixes).

### [ ] 14. Out-of-the-Box Standard Workflow Library
- **Current State:** The repository includes only `examples/weekend.md`.
- **Objective:** Bundle ready-to-use workflows for standard development workflows: PR reviews (`review-pr.md`), release preflight checks (`release-preflight.md`), and refactor loops (`refactor-module.md`).
- **Agent Triage:** Keep bundled workflows portable across frameworks without assuming specific build or test tools.

### [ ] 15. Community Catalog & Converted Skills Directory
- **Current State:** No catalog or index exists for community workflows or skills converted into workflow definitions.
- **Objective:** Create an `awesome-wf` showcase with practical workflow examples, converted agent skills, and contribution guidelines.
- **Agent Triage:** Keep catalog files separate from the core plugin distribution bundle to avoid increasing package install size.

### [ ] 16. Multi-Harness Matrix CI/CD Pipeline
- **Current State:** `ci.yml` tests Node 22 on push/PR and `publish.yml` publishes on manual workflow dispatch, but multi-OS matrices and automated tag-based release triggers are absent.
- **Objective:** Expand CI to test across Node versions and operating systems, automate tag-based publishing, and run automated integration tests against simulated harness payloads.
- **Agent Triage:** Keep CI fast by testing harnesses via recorded mock payloads rather than spinning up full agent runtimes.
