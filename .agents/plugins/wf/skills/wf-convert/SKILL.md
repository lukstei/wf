---
name: wf-convert
description: Convert an existing SKILL.md or procedural instructions file into a deterministic wf Markdown workflow, and validate it using the CLI runner.
argument-hint: "<skill-path> [output-workflow-path]"
---

# Convert Skill to Workflow (`wf-convert`)

Convert an existing `SKILL.md` or procedural instructions guide into a deterministic `wf` workflow and validate it using the bundled CLI.

## Workflow Conversion Protocol

Follow these four steps sequentially:

### 1. Read and Analyze the Source File

Read the target `SKILL.md` using `view_file`. Identify the structural components:

- **Metadata & Preamble**: YAML frontmatter (`name`, `description`). General rules, constraints, or environment assumptions belong in the global preamble directly beneath `# Title`.
- **Linear Actions**: Discrete commands, code edits, or sequential instructions become action steps (`## <Title>`).
- **Decisions & Branching**: Conditions, triage questions, or checks become conditional steps (`## If: <Condition>`).
  - Child steps under YES branch: `### <Step Title>`.
  - Alternative path: `### No` or `### Else` (must be the last child step).
- **User Interaction & Human Review**: If a step's intention is to interact with the user (asking questions, soliciting decisions, or requiring approval before destructive actions), the step **must** use `## Gate: <Title>`. Otherwise, the workflow won't be stopped.

### 2. Synthesize the Workflow File

Write the target workflow markdown file (default destination: `workflows/<name>.md` or alongside the source file).
If possible, take the original instructions in the SKILL.md file as-is.

Structure rules (from `docs/SYNTAX.md`):
- Use frontmatter with `name` and `description`.
- `# Title` declares the workflow name if not in frontmatter.
- Text between `# Title` and the first `##` step heading is the preamble injected into all steps.
- `## <Step>`: Plain action steps.
- `## If: <Condition>`: Requires a colon after `If:`.
- `### <Substep>`: Nested under `If:` for YES branch steps.
- `### No` / `### Else`: Nested under `If:` for NO branch steps.
- `## Gate: <Title>`: Requires a colon after `Gate:`. If a step's intention is to interact with the user, it must use `Gate:`—otherwise the workflow runner will not stop. The body must clearly state what to present or ask the user before pausing.

Example template:
```markdown
---
name: sample-workflow
description: Short summary of what this workflow accomplishes
---

# Sample Workflow

Preamble context explaining prerequisites, shared rules, and working directory constraints.

## 1. Setup Environment
Verify dependencies and clean temporary files.

## 2. If: Are database migrations pending?
Run migration status check.

### Apply Migrations
Run database migration script.

### No
Log that database schema is up to date.

## 3. Gate: Approve Release
Present the changelog to the user. Wait for confirmation before proceeding.
```

### 3. Validate via CLI Entrypoint

Immediately validate the created workflow using the CLI runner:

```bash
node dist/wf.cjs compile <output-workflow-path> --check
```

- If validation reports errors (exit code `1`):
  - Read the error diagnostics (e.g. empty steps, missing condition expressions, missing YES branch steps, or empty gate instructions).
  - Edit the workflow file to resolve each issue.
  - Re-run `node dist/wf.cjs compile <output-workflow-path> --check` until it exits `0`.
- Check the workflow json for semantic correctness. Do not save the workflow json.

### 4. Visualize Graph Topology

Once valid, display the generated Mermaid diagram and step structure:

```bash
node dist/wf.cjs show <output-workflow-path>
```

Confirm that the step sequence, branch routes, and human gates accurately represent the intended process.
