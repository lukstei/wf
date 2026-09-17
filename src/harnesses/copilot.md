# GitHub Copilot / VS Code Agent Integration Specification

This document details the architecture and runtime behavior for integrating `wf` with **GitHub Copilot** in VS Code.

---

## 1. Specification Matrix

| Dimension | Specification |
| :--- | :--- |
| **Plugin Discovery** | Subdirectory under `.vscode/agent-plugins/` or extension root |
| **Hook Manifest** | Reuses Claude hook declarations (`hooks/claude-codex-hooks.json`) |
| **Payload Casing** | `snake_case` (mirrors Claude Code payload conventions) |
| **Lifecycle Events** | `UserPromptSubmit` (pre), `Stop`, `PreToolUse` |
| **Blocking Mechanism** | JSON stdout (`{"permissionDecision": "deny", "permissionDecisionReason": "..."}`) |
| **Tool Input Modification** | Not supported |
| **Context Injection** | Top-level `{"additionalContext": "..."}` on `pre` |
| **Autonomous Loop Continuation** | Supported via Stop hook returning `{"decision": "block", "reason": "..."}` |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` (pointing inside `.vscode/.../agent-plugins/`) |
| **State Storage Variable** | `COPILOT_PLUGIN_DATA` |

---

## 2. Discovery & Markers

VS Code Copilot loads plugins via `.vscode/agent-plugins/`. It sets `CLAUDE_PLUGIN_ROOT` pointing inside that path, or sets `COPILOT_PLUGIN_DATA`.

---

## 3. Harness Detection

Identified by:
1. `process.env.COPILOT_PLUGIN_DATA`
2. `process.env.CLAUDE_PLUGIN_ROOT` path containing both `agent-plugins` and `.vscode`.

---

## 4. Egress Protocol

- **Pre / Prompt Submission**: Emits top-level `additionalContext`:
  ```json
  {
    "additionalContext": "Step instructions..."
  }
  ```
- **Stop**:
  - Continuation:
    ```json
    {
      "decision": "block",
      "reason": "Step instructions..."
    }
    ```
  - Termination: Returns empty JSON `{}`.
- **Tool (`PreToolUse`)**: Emits `permissionDecision`:
  ```json
  {
    "permissionDecision": "deny",
    "permissionDecisionReason": "Action blocked by workflow policy."
  }
  ```
