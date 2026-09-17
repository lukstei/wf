# Anthropic Claude Code Integration Specification

This document details the architecture, lifecycle protocols, and runtime behavior for integrating `wf` with **Anthropic Claude Code**.

---

## 1. Specification Matrix

| Dimension | Specification |
| :--- | :--- |
| **Plugin Manifest** | Project/Global: `.claude-plugin/plugin.json` (or root `plugin.json`) |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/claude-codex-hooks.json"` |
| **Marketplace Catalog** | Catalog file: `.claude-plugin/marketplace.json` |
| **Payload Casing** | `snake_case` |
| **Lifecycle Events** | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop` |
| **Tool Matchers** | Pipe-delimited string (e.g., `"Bash\|Edit\|Write"`) |
| **Blocking Mechanism** | **Exit Code 2** (+ explanation written to `stderr`) |
| **Tool Input Modification** | JSON stdout `updatedInput` (wholesale input object replacement) |
| **Context Injection** | `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "block", "reason": "..."}` with exit code `0` |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` |
| **State Storage Variable** | `CLAUDE_PLUGIN_DATA` |

---

## 2. Discovery & Environment

Claude Code discovers plugins via `.claude-plugin/`:

- **Manifest Path**: `.claude-plugin/plugin.json`
- **Hooks Declaration**: Points to `hooks/claude-codex-hooks.json`

### Environment Variables

| Variable | Purpose |
| :--- | :--- |
| `CLAUDE_PLUGIN_ROOT` | Root directory of the installed plugin bundle. |
| `CLAUDE_PROJECT_DIR` | Working directory of the active user project. |
| `CLAUDE_PLUGIN_DATA` | Persistent directory for plugin session state. |

---

## 3. Harness Detection

Claude Code is identified by:
1. Environment variables: `CLAUDE_PLUGIN_ROOT` or `CLAUDE_PROJECT_DIR` (excluding VS Code Copilot paths).
2. Structural markers on stdin: `hook_event_name`, `tool_name`, `stop_hook_active`, or `last_assistant_message`.

---

## 4. Lifecycle Hooks & Egress Protocol

### 4.1 Stop Hook
- Triggers when an assistant turn finishes.
- **Continuation**: To keep the workflow moving without waiting for human input, write JSON on stdout and exit `0`:
  ```json
  {
    "decision": "block",
    "reason": "[WORKFLOW: Step 2/3]\n\nExecute next step..."
  }
  ```
- **Termination**: To allow Claude to stop (workflow complete, waiting for gate, or paused), output `{}` with exit code `0`.
- **Runaway Loop Protection**: The workflow runner terminates when the workflow is complete or paused. Claude Code's platform block cap (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) prevents runaway loops. Intermediate continuation turns have `stop_hook_active: true` and continue with `{"decision": "block"}` until workflow completion.

### 4.2 UserPromptSubmit Hook
- Triggers when a user enters a prompt or runs a command like `/wf-next`.
- Injects context via `hookSpecificOutput`:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": "Step instructions..."
    }
  }
  ```

### 4.3 PreToolUse Hook
- Triggers before a tool executes.
- **Blocking**: Denying a tool requires **exit code 2** with the reason printed to `stderr`:
  ```bash
  exit 2
  # stderr: "Action blocked by workflow policy."
  ```
- **Allowing**: Exit code `0` with empty output.
- **Modifying Input**: Exit code `0` with `updatedInput` replacing arguments completely.

---

## 5. Installation & Distribution

Install via Claude Code CLI:

```bash
claude plugin marketplace add your-org/wf
claude plugin install wf@wf-marketplace
```

Or from inside an interactive session:

```bash
/plugin marketplace add your-org/wf
/plugin install wf@wf-marketplace
```
