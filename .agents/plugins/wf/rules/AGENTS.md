# Workflow Runner (`wf`) Guidelines

These rules govern agent behavior whenever the `wf` plugin or an active workflow is present.

---

## 1. Strict Step-by-Step Execution

- **Execute Only the Active Step:** When a step instruction is injected into context, execute that specific step and nothing else.
- **Never Jump Ahead:** Do not anticipate or execute subsequent steps, future phases, or follow-on actions ahead of time.
- **Conclude Immediately:** Stop and complete your response as soon as the current step's task is finished. The workflow engine will automatically inject the next step.

## 2. Never Read Raw Workflow Files

- **Ban on Reading Workflow Files:** Do not use `view_file`, `grep_search`, `read_url_content`, or shell commands to view raw workflow files (`.md` / `.json`) or plugin `SKILL.md` definitions during execution.
- **Why:** The workflow runner already compiles, tracks, and injects each step with its relevant context into your prompt. Reading raw workflow files clutters the context window, duplicates state, and leads to hallucinated out-of-order execution.

## 3. Condition Step Decision Format

- **Evaluation:** When injected with a condition evaluation step, evaluate whether the stated condition is true or false using appropriate read-only inspection tools if necessary.
- **Strict Decision Token:** Always end your response with strictly either `[DECISION: YES]` or `[DECISION: NO]`.
- **Placement:** The decision token must appear at the very end of your response so the runner can deterministically parse the branch choice and advance the workflow.

## 4. Workflow Runner Commands

Users and agents interact with workflows via slash commands (Claude Code / AGY) or `$` mentions (Codex CLI):

| Command (Claude / AGY) | Command (Codex CLI) | Description |
| :--- | :--- | :--- |
| `/wf <workflow-file>` | `$wf:wf <workflow-file>` | Start and run a workflow from a Markdown (`.md`) or JSON (`.json`) file. |
| `/wf-show [<workflow-file>]` | `$wf:wf-show [<workflow-file>]` | Display workflow status, Mermaid diagram, and current position (or visualize a file). |
| `/wf-next` | `$wf:wf-next` | Advance and execute the next step when a workflow is paused. |
| `/wf-stop` | `$wf:wf-stop` | Abort and reset the currently active or paused workflow. |
| `/wf-help` | `$wf:wf-help` | Display usage instructions and supported runner commands. |
