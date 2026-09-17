# Universal Agent Plugin Architecture, Packaging & Publishing Guide

Supporting Google Antigravity (AGY), Anthropic Claude Code, and OpenAI Codex from a single repository.

---

## 1. Executive Summary & Core Architecture

Agent harnesses—**Google Antigravity (AGY)**, **Anthropic Claude Code**, **OpenAI Codex CLI**, and **VS Code Copilot**—differ across several core areas:

- **Manifest Locations**: Different directories and filenames (`plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`).
- **Lifecycle Protocols**: Different event triggers, payload casing (camelCase protojson vs. snake_case JSON), and control signals (exit code `2` vs. JSON stdout decisions).
- **Execution Constraints**: Claude Code and Codex cache plugins without running `npm install`; commands must be pre-bundled and cross-platform.

### Single-Source Strategy

Maintaining separate plugins per harness leads to configuration drift and maintenance overhead. The solution used by `wf` (and reference plugins like Ponytail) is a universal, single-source design:

1. **Shared Knowledge & Rules**: A single set of `skills/` (`SKILL.md`) and behavioral instructions (`AGENTS.md`) shared across all harnesses.
2. **Dedicated Manifest Zones**: Partitioned manifest directories (`.claude-plugin/`, `.codex-plugin/`, `.agents/`) that co-exist without collision.
3. **Modular Harness Adapters**: Dedicated adapters in `src/harnesses/` implementing a common [`HarnessAdapter`](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/types.ts) interface.
4. **Zero-Dependency Bundled Hook Shim**: A single, bundled script (`dist/wf.cjs`) built via `esbuild` that auto-detects the host harness, normalizes events, executes core workflow logic, and formats egress per harness specification.

---

## 2. Harness Specifications

Detailed specifications, wire schemas, lifecycle protocols, and egress formats are documented in each harness guide:

- [OpenAI Codex CLI Specification](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/codex.md)
- [Anthropic Claude Code Specification](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/claude.md)
- [Google Antigravity (AGY) Specification](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/agy.md)
- [GitHub Copilot / VS Code Agent Specification](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/copilot.md)

---

## 3. Empirical Discoveries & Platform Pitfalls

### 1. The `hooks/hooks.json` Name Collision Trap
- **Issue**: Antigravity automatically scans for and loads any file named `hooks/hooks.json` at the repository root. If that file declares Claude Code hook events (`SessionStart`, `UserPromptSubmit`), Antigravity fails on boot.
- **Fix**: Name the shared Claude/Codex hook manifest `hooks/claude-codex-hooks.json`. Reference it explicitly inside `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`. Place AGY hooks in `.agents/plugins/wf/hooks.json`.

### 2. Windows PowerShell Stdin Hang
- **Issue**: On Windows, Claude Code runs hook commands inside PowerShell scriptblocks. PowerShell pipes sometimes fail to send `EOF` to child Node processes. Calling `process.stdin.on('end')` can hang indefinitely.
- **Fix**: Attach an unreferenced timeout fallback to stdin reads:
  ```typescript
  let input = "";
  let handled = false;

  function finish() {
    if (handled) return;
    handled = true;
    runLogic(input);
  }

  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", finish);
  setTimeout(finish, 1000).unref();
  ```

### 3. Stripping UTF-8 Byte Order Marks (BOM)
- **Issue**: Windows shells prepend `\uFEFF` when piping JSON to standard input, causing `JSON.parse()` to throw a syntax error.
- **Fix**: Strip BOM before parsing: `JSON.parse(rawInput.replace(/^\uFEFF/, ""))`.

### 4. Avoiding `commandWindows` in Manifests
- **Issue**: Claude Code marketplace validators reject `commandWindows` as unrecognized schema.
- **Fix**: Use a single cross-platform command string with quoted paths:
  ```json
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/wf.cjs\" hook pre"
  ```
  Avoid `exec node`, `command -v`, `&&`, or bashisms that crash PowerShell.

### 5. Zero-Dependency Bundling
- **Issue**: Neither Claude Code nor Codex runs `npm install` during installation. Unbundled runtime dependencies cause `MODULE_NOT_FOUND`.
- **Fix**: Bundle all dependencies into `dist/wf.cjs` using `esbuild`:
  ```bash
  esbuild src/shim/runtime-shim.ts --bundle --platform=node --target=node18 --format=cjs --outfile=dist/wf.cjs
  ```

---

## 4. Repository Layout

```text
wf/
├── .agents/                          # Google Antigravity ecosystem
│   ├── plugins/
│   │   ├── marketplace.json          # AGY marketplace catalog
│   │   └── wf/
│   │       ├── plugin.json           # AGY manifest
│   │       └── hooks.json            # AGY lifecycle dispatch table
│   └── rules/
│       └── AGENTS.md                 # Antigravity behavioral guidelines
│
├── .claude-plugin/                   # Claude Code configuration
│   ├── marketplace.json              # Claude Code marketplace catalog
│   └── plugin.json                   # Manifest pointing to hooks & skills
│
├── .codex-plugin/                    # OpenAI Codex configuration
│   └── plugin.json                   # Codex manifest with interface metadata
│
├── hooks/                            # Declarative hook manifests
│   └── claude-codex-hooks.json       # Shared Claude & Codex hook declarations
│
├── skills/                           # Universal skill definitions
│   └── wf/
│       └── SKILL.md                  # Workflow skill instructions
│
├── src/
│   ├── harnesses/                    # Harness-specific adapters & docs
│   │   ├── types.ts                  # HarnessAdapter & EgressOutput types
│   │   ├── index.ts                  # Registry & detection router
│   │   ├── codex.ts & codex.md       # Codex adapter & spec
│   │   ├── claude.ts & claude.md     # Claude Code adapter & spec
│   │   ├── agy.ts & agy.md           # Antigravity adapter & spec
│   │   └── copilot.ts & copilot.md   # Copilot adapter & spec
│   │
│   ├── shim/                         # Runtime CLI shim
│   │   ├── runtime-shim.ts           # Entry point: stdin buffering & execution
│   │   ├── stdin.ts                  # Stdin reader & JSON parser
│   │   ├── detect.ts                 # Harness detection delegate
│   │   └── egress.ts                 # Egress formatting delegate
│   │
│   ├── handlers/                     # Lifecycle handlers (pre, stop)
│   ├── actions/                      # Workflow actions (run, next, step, condition, show)
│   ├── lib/                          # Markdown parser, commands, visualization
│   ├── state.ts                      # Disk state serialization
│   ├── conversation.ts               # Conversation state management
│   └── transitions.ts                # State transitions & status mutations
│
├── dist/
│   └── wf.cjs                        # Bundled zero-dependency production artifact
│
├── esbuild.config.js                 # Bundler config
├── package.json                      # NPM configuration
├── AGENTS.md                         # Repository behavioral rules
└── README.md                         # Project documentation
```

---

## 5. Hook Shim Pipeline

The hook shim isolates host harness differences from core workflow logic through four stages:

```mermaid
flowchart LR
    A[Harness stdin] --> B[1. Detection & Ingestion]
    B --> C[2. Event Normalization]
    C --> D[3. Workflow Engine & Transitions]
    D --> E[4. Egress Adapter]
    E --> F[Harness stdout / exit]
```

### Modular Harness Adapter Architecture

Each harness implements the [`HarnessAdapter`](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/types.ts) interface:

```typescript
export interface HarnessAdapter {
  readonly id: HarnessType;
  detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean;
  normalize(
    payload: Record<string, unknown>,
    modeArg?: string,
    env?: NodeJS.ProcessEnv,
  ): NormalizedEvent;
  formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput;
  extractLatestMessage(event: NormalizedEvent): LatestMessage | null;
}
```

1. **Detection**: Checked in sequence by [`detectHarness`](file:///Users/Lukas.Steinbrecher/dev/wf/src/harnesses/index.ts). Returns `HarnessType | null`. If unhandled, the shim exits `0` with no output.
2. **Normalization**: Performed by `adapter.normalize(payload, modeArg, env)` to build a harness-specific `NormalizedEvent` (`pre`, `stop`, or `tool`) containing the conversation ID, workspace path, prompt, tool call, and `latestMessage`.
3. **Execution**: Core handlers parse commands, update workflow state via [`src/transitions.ts`](file:///Users/Lukas.Steinbrecher/dev/wf/src/transitions.ts), and produce a standard `HookResponse`.
4. **Egress**: The adapter translates `HookResponse` into stdout JSON or stderr exit codes matching the host harness.

---

## 6. State Persistence

CLI hooks run as isolated, ephemeral processes. State across turns is persisted to disk keyed by conversation ID:

- Session paths resolve via [`src/conversation.ts`](file:///Users/Lukas.Steinbrecher/dev/wf/src/conversation.ts), respecting harness-provided directories (`PLUGIN_DATA`, `CLAUDE_PLUGIN_DATA`) and falling back to `.agents/workflows/` or temporary system directories.
- State writes use atomic file replacement to prevent corrupted reads during concurrent hooks.
- All state transitions and mutations are centralized in [`src/transitions.ts`](file:///Users/Lukas.Steinbrecher/dev/wf/src/transitions.ts).

---

## 7. Packaging & Publishing Playbook

### 7.1 Anthropic Claude Code
1. Commit `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`.
2. Users install via:
   ```bash
   claude plugin marketplace add your-org/wf
   claude plugin install wf@wf-marketplace
   ```

### 7.2 Google Antigravity (AGY)
1. Commit `.agents/plugins/wf/plugin.json` and `.agents/plugins/wf/hooks.json`.
2. Declare in `.agents/plugins/marketplace.json`.
3. Workspace clones immediately inherit the plugin. Global install via:
   ```bash
   agy plugin install https://github.com/your-org/wf
   ```

### 7.3 OpenAI Codex CLI
1. Commit `.codex-plugin/plugin.json` referencing `hooks/claude-codex-hooks.json`.
2. Users install and trust the bundle:
   ```bash
   codex plugin marketplace add your-org/wf
   codex plugin install wf
   codex plugin trust wf
   ```

### 7.4 NPM Registry
1. Build the zero-dependency bundle: `npm run build`.
2. Publish with provenance: `npm publish --provenance --access public`.
