# Workflow Syntax Specification (`wf`)

This document specifies the Markdown grammar, structure, and validation rules for `wf` workflow documents.

---

## 1. Document Structure & Metadata

A workflow document consists of three optional or mandatory layers: frontmatter, a workflow declaration, and step definitions.

```markdown
---
name: deploy-service
description: Build, verify, and deploy service to production
---

# Production Deployment Pipeline

Global preamble text injected into all step execution prompts.
Must precede the first step heading.

## 1. Prepare Environment
Run environment setup scripts.
```

### Frontmatter (Optional)
YAML frontmatter may appear at the beginning of the file, enclosed in triple-dash lines (`---`):
- `name` *(string)*: Identifier for the workflow. Overrides `# H1`.
- `description` *(string)*: Human-readable summary of the workflow purpose.

### Workflow Name Resolution
The workflow name is resolved in the following priority order:
1. `name` field declared in YAML frontmatter.
2. Plain-text content of the first Level 1 heading (`# H1`).
3. File basename (excluding extension) if resolved from a file path.
4. Fallback default: `"Workflow"`.

### Global Preamble
Any markdown content between the `# H1` heading (or frontmatter end, if no `# H1` exists) and the first step heading constitutes the **global preamble**. At runtime, this content is injected into every step execution prompt under `CONTEXT:`.

---

## 2. Heading Structure & Keywords

Step boundaries and control flow are declared using Markdown headings.

### Heading Levels & Hierarchy
The workflow structure is determined by relative heading levels:
- **Top-Level Steps**: Main workflow steps use `##` headings (or whatever primary heading level is chosen below `# H1`).
- **Branch Steps**: Steps inside conditional branches use deeper headings (such as `###` under a `## If:` condition, or `####` under a `### If:` condition). Sub-branches can be nested as deeply as needed.
- **Linear Steps Do Not Nest**: Subheadings beneath a standard action step (e.g. `###` under `## Deploy`) are treated as formatted instruction text within that step, not separate execution steps.

### Control Keywords
A heading becomes a control step when its title begins with one of four keywords followed immediately by a colon (`:`):
- `If:`: Declares a conditional branch point.
- `Else:` / `No:`: Declares the negative branch of a condition. The text after the keyword is a step title, not a condition. When the condition evaluates to `NO`, this branch runs directly without checking or evaluating that text.
- `Gate:`: Declares a human verification checkpoint.
- *(No keyword or no colon)*: Standard linear action step.

Keywords are case-insensitive (`if:`, `IF:`, `If:`). The colon is **mandatory**; any heading lacking a colon is treated as a plain action step to prevent accidental keyword collisions with natural text.

### Prefixes & Heading Examples

Headings can include step numbering or single-word prefix labels before the keyword. The parser distinguishes control steps from standard action steps as follows:

#### Recognized as Control Steps (Colon Required)
- `## If: tests pass?` — Condition
- `## 1. If: tests pass?` — Numbered condition
- `## Step 1: Gate: Approve deploy` — Labeled gate
- `## Schritt 1: Gate: Erlaubnis einholen` — Labeled gate
- `## Else:` or `## No: Skip migrations` — Negative branch
- `## *if:* tests pass?` — Condition (inline markdown formatting stripped to plain text)

#### Treated as Normal Action Steps (No Colon or Not a Keyword)
- `## If tests pass?` — Action step (no colon after `If`)
- `## *if* tests pass?` — Action step (no colon)
- `## Gate release candidate` — Action step (no colon after `Gate`)
- `## No dependencies required` — Action step (no colon after `No`)
- `## 1. Run migrations` — Numbered action step (title preserved as `"1. Run migrations"`)
- `## Step 1: Prepare environment` — Labeled action step
- `## Deploy service` — Plain action step

> [!NOTE]
> For action steps, numbers and prefix labels are preserved in the step title. For control steps (`If:`, `Gate:`, `Else:`, `No:`), the prefix and keyword configure the step, and only the remaining text becomes the condition or title.

---

## 3. Step Types

`wf` compiles headings and body content into three runtime step types:

| Step Type | Control Keyword | Body Content Role | Runtime Execution Behavior |
| :--- | :--- | :--- | :--- |
| `step` | *(None)* | Step instructions | Executes instructions; auto-advances on completion. |
| `gate` | `gate` | Verification instructions | Executes instructions; transitions status to `paused` and awaits `/wf-next`. |
| `condition` | `if` | Evaluation instructions | Evaluates condition; requires `[DECISION: YES]` or `[DECISION: NO]`. |

### Action Step (`type: "step"`)
Standard execution step.
- **Title**: Heading text (with numbers/prefixes preserved).
- **Instruction**: Markdown text between this heading and the next step heading.

### Human Approval Gate (`type: "gate"`)
Execution checkpoint requiring manual confirmation before subsequent steps run.
- **Syntax**: `## Gate: <title>`
- **Title**: Extracted title after the `gate:` keyword, or `"gate"`.
- **Instruction**: Markdown text describing what the human or agent must verify.
- **Runtime Lifecycle**:
  1. The agent executes the gate instructions during turn $N$.
  2. The runner transitions the workflow state to `status: "paused"` without advancing the step index.
  3. Execution halts until the user enters `/wf-next` (Codex: `$wf:wf-next`) to resume and advance to the step following the gate, or `/wf-stop` to abort.

### Condition Step (`type: "condition"`)
Branching node evaluated dynamically by the model.
- **Syntax**: `## If: <expression>`
- **Condition Expression**: Extracted expression following the `if:` keyword.
- **Evaluation Instruction**: Optional body text immediately following the `if` heading prior to child headings. If omitted, the runner generates a default inspection prompt:
  ```text
  Evaluate whether the following condition is true or false: "<expression>".
  If needed, use tools to inspect the environment, files, date/time, or git state.
  ```
- **Branches**: Contains a `yes` branch and an optional `no` branch.

---

## 4. Branching Graph Construction

`wf` supports two syntax patterns for conditional branches: **Hierarchical (Child Headings)** and **Sibling (Sequential Headings)**.

### Pattern A: Hierarchical Branching (Child Headings)

Child headings indented beneath `## If:` construct the branch pathways.

```markdown
## If: Migrations required?
Run prisma migrate status to check pending migrations.

### Run Migrations
Execute `prisma migrate deploy`.

### Verify Schema
Confirm database tables match schema definitions.

### No: Skip Migrations
Log that database is up to date.
```

1. **YES Branch**: All child headings preceding the `else`/`no` heading belong to the YES branch. Must contain at least one step.
2. **NO Branch (Optional)**: A child heading matching `else` or `no` marks the beginning of the NO branch.
   - Any child headings following the `else`/`no` heading belong to the NO branch.
   - Title of the NO heading is extracted from text after `else`/`no` (e.g., `### No: Skip Migrations` -> Title: `"Skip Migrations"`).
   - **Text after `Else:` / `No:` is not a condition**: When the `If:` condition is not fulfilled (evaluated as `NO`), the `Else:` branch executes directly. Any text following the keyword is solely a human-readable title for the step and is not checked or evaluated.
   - If no `else`/`no` heading is present, the NO branch is omitted. When evaluated as `NO`, execution jumps directly past the condition's child steps to the next top-level step.

### Pattern B: Sibling Branching (Sequential Headings)

For single-step branches, an `if` heading without child headings paired with an immediate sibling `else`/`no` heading forms a binary branch:

```markdown
## If: Is today Friday?
Output: "Happy Friday!"

## Else:
Calculate and report days remaining until Friday.
```

- When an `if` heading has no child headings and is immediately followed by an `else`/`no` heading at the same level:
  - The body of `## If:` compiles into a single YES step titled `"<condition> yes"`.
  - The body of `## Else:` compiles into a single NO step titled `"<condition> no"` (or the title declared after `else`). As with child branches, any text after `Else:` (e.g. `## Else: Fallback action`) is only a title; the branch executes whenever the condition is not fulfilled without checking this text.

### Nested Branching
Branches may nest to arbitrary depths. A child step inside a YES or NO branch may itself be a condition (`### If:` or `#### If:`), human gate, or sub-step sequence:

```markdown
## If: Production environment?
Verify target cluster configuration.

### Gate: Confirm Production Deployment
Human checkpoint before touching production infrastructure.

### If: Database migration needed?
Inspect migration directory for unapplied scripts.

#### Apply Migration
Run migration runner in transaction mode.

#### Else:
Log migration skipped.

### No: Local Environment
Run `docker compose up -d`.
```

---

## 5. Condition Evaluation & Decision Protocol

During condition evaluation steps, the agent inspects the environment and concludes its turn with a decision token.

### Execution Protocol
1. **Turn Start**: Injected instructions require the agent to begin its response with:
   ```text
   Checking condition: <condition>
   ```
2. **Tool Use**: The agent executes any necessary read-only tools (e.g. running shell commands, reading git status, checking date/time).
3. **Turn Conclusion**: The agent concludes its response with the decision token:
   ```text
   [DECISION: YES]
   ```
   or
   ```text
   [DECISION: NO]
   ```

### Branch Routing
- **YES**: Execution advances to the first step of the YES branch.
- **NO**: Execution jumps to the first step of the NO branch, or skips past the condition block if no NO branch exists.
- Any response other than `YES` defaults safely to `NO`.

---

## 6. Examples

### Standard Linear Flow
```markdown
# Asset Pipeline

## 1. Clean Output
Remove stale build artifacts in `dist/`.

## 2. Compile TypeScript
Run `npm run build` and ensure zero diagnostic errors.

## 3. Package Bundle
Execute `./scripts/package.sh` to generate release tarball.
```

### Condition with Sibling Fallback
```markdown
# Test & Deploy

## 1. Run Verification
Run `npm run verify`.

## If: Did verification pass?
Publish package to registry.

## Else:
Report test failures to user and exit.
```

### Condition with Hierarchical Steps and Gate
```markdown
# Release Flow

## If: Tagged release?
Check if `git describe --exact-match` resolves.

### Gate: Authorize Release
Verify release notes and prompt user for deployment sign-off.

### Publish Artifacts
Run `npm publish --provenance`.

### No:
Log that current commit is not a tagged release.
```
