---
name: wf-convert
description: Convert an existing SKILL.md or procedural instructions file into a deterministic wf Markdown workflow, and validate it using the CLI runner.
argument-hint: "<skill-path> [output-workflow-path]"
---

# Convert Skill to Workflow (`wf-convert`)

Convert an existing `SKILL.md` or procedural instructions guide into a deterministic `wf` workflow and validate it using the CLI runner.

## Invocation Arguments

- `$1` (`<skill-path>`, required): Path to the source `SKILL.md` or procedural markdown file.
- `$2` (`[output-workflow-path]`, optional): Destination path for the generated workflow file.
  - If omitted: default to `workflows/<name>.md` if a `workflows/` directory exists in the workspace, or `<source-dir>/<name>.md`.

---

## Conversion Protocol

Follow these five phases in sequence:

### 1. Ingestion & Content Classification

Read the target file using `view_file` (bound with `StartLine`/`EndLine`). Classify all content into five categories:

1. **Global Preamble (Context & Invariants)**:
   - Environment assumptions, tool constraints, safety rules, working directory paths.
   - Text placed between `# Title` and the first `##` step becomes the **global preamble**.
   - **Preamble Hygiene Rule**: The preamble is injected into *every single step's runtime prompt*. Do **not** copy entire reference manuals, script dumps, or long background essays into the preamble. Keep only cross-cutting rules and execution invariants.
2. **Linear Actions**:
   - Discrete commands, code edits, verification scripts, or sequential work items.
   - Become standard action steps: `## <Step Title>`.
3. **Decisions & Branching**:
   - Checks, triage questions, or conditional forks ("If X passes...", "Check whether...").
   - Become condition steps: `## If: <Condition>`.
4. **Human Interaction & Approval Gates**:
   - Asking user questions, soliciting decisions, reviewing plans, or confirming before destructive actions.
   - **Must** become human gates: `## Gate: <Title>`.
5. **Step-Specific Reference Material**:
   - Detailed instructions, templates, or script examples that only apply to a specific step.
   - Place these inside the specific step's instruction body, not in the global preamble.

---

### 2. Pattern Mapping Matrix

Use this matrix to translate common patterns in skills to `wf` syntax:

| Source Pattern in Skill / Guide | `wf` Target Construct | Syntax & Placement Rules |
| :--- | :--- | :--- |
| "Ask the user...", "Confirm with user...", "Wait for approval", "Present plan for review" | **Human Gate** | `## Gate: <Title>`<br>Body must specify: (1) what to present to the user, (2) what prompt/question to ask. |
| "If X then Y otherwise Z", "Check whether...", "Triage..." | **Condition Step** | `## If: <Condition>`<br>YES child steps: `### <Step Title>`<br>NO child step: `### Else:` or `### No: <Title>` |
| Sub-actions inside a condition's YES or NO branch | **Branch Action Step** | `### <Step Title>` (nested one level deeper than `## If:`) |
| Nested conditions inside a branch | **Nested Condition** | `### If: <Condition>`<br>Child steps: `#### <Step Title>`<br>Child NO: `#### Else:` |
| Sequential commands, scripts, code edits, verification | **Action Step** | `## <Step Title>`<br>Body must contain non-empty instruction text. |
| Sub-headings inside a linear step | **Formatted Text** | `###` headings inside a normal `## Step` are treated as text formatting within that step, **not** separate execution steps. |

---

### 3. Synthesis & Syntax Invariants

Synthesize the target workflow file following these strict syntax rules (from `docs/SYNTAX.md`):

1. **Frontmatter & Title**:
   - Include YAML frontmatter with `name` and `description`.
   - Include `# Title` as the H1 heading.
2. **Mandatory Colons on Control Keywords**:
   - Control keywords **require** a trailing colon: `If:`, `Gate:`, `Else:`, `No:`.
   - Without a colon (e.g. `## If tests pass`), the heading is parsed as a standard action step, breaking control flow!
3. **Child Nesting for `Else:` / `No:`**:
   - `Else:` / `No:` **must be a child heading** (`H(N+1)`), never a sibling (`H(N)`).
   - In `## If:`, the negative branch is `### Else:` or `### No:`.
   - Sibling `## Else:` is invalid and will not attach to the condition.
4. **Text After `Else:` / `No:` is a Title**:
   - Text after `Else:` or `No:` is the title of the step (e.g. `### No: Skip Migrations`), **not** an evaluated condition expression. The negative branch executes directly when the condition evaluates to `NO`.
5. **YES Branch Requirement**:
   - Every condition **must** have at least one child step under the YES branch before any `Else:`/`No:` heading.
6. **No Empty Step Instructions**:
   - Every action step (`step`) and gate step (`gate`) must contain non-empty markdown instructions beneath the heading.

#### Canonical Workflow Template

```markdown
---
name: deploy-service
description: Build, verify, and deploy service to production
---

# Production Deployment Pipeline

Global preamble: cross-cutting rules and environment constraints.
Injected into all step prompts under CONTEXT.

## 1. Verify Dependencies
Run dependency checks and ensure clean working directory:
```bash
npm run check:clean
```

## 2. If: Are database migrations pending?
Inspect pending migrations using the migration status tool.

### Apply Migrations
Run database migration deploy script:
```bash
npm run db:migrate
```

### Verify Migration
Confirm database tables match schema definitions.

### No: Skip Migrations
Log that database schema is up to date and proceed.

## 3. Gate: Approve Production Release
Present the changelog and test results to the user.
Wait for explicit user confirmation before proceeding to production deploy.

## 4. Deploy Service
Trigger deployment pipeline:
```bash
npm run deploy:prod
```
```

---

### 4. CLI Validation & Self-Correction

Immediately validate the created workflow using the CLI runner:

```bash
npx @lukstei/wf compile <output-workflow-path> --check
```
*(Or `wf compile <output-workflow-path> --check` if `wf` is installed in PATH).*

#### Diagnostic Error Resolution

If validation reports errors (exit code `1`), resolve them according to this table and re-run:

| Diagnostic Problem ID | Cause | Resolution |
| :--- | :--- | :--- |
| `workflow-missing-name` | Missing workflow name | Add `name:` in YAML frontmatter or `# <Title>` heading. |
| `workflow-no-steps` | No `##` step headings found | Ensure steps use `## <Title>` headings. |
| `step-missing-title` | Heading has no title after keyword | Provide a descriptive title after the prefix/keyword. |
| `step-action-empty-instruction` | Action step has no body text | Add actionable instruction content under the `## <Title>` heading. |
| `step-gate-empty-instruction` | Gate has no verification body | Add text describing what to present and what approval is needed. |
| `step-condition-empty-expression` | `If:` has no condition text | Add condition expression after `If:` (e.g. `## If: tests pass?`). |
| `step-condition-empty-yes` | No child steps under `If:` | Add at least one child step (`### <Title>`) under the condition. |
| `step-condition-empty-no` | `Else:`/`No:` has empty body | Add instruction text or sub-steps under `### Else:`. |

Re-run validation until it exits with code `0`.

---

### 5. Topology Verification

Once compilation succeeds, display the generated Mermaid diagram and step structure:

```bash
npx @lukstei/wf show <output-workflow-path>
```
*(Or `wf show <output-workflow-path>` if `wf` is installed in PATH).*

Inspect the output to confirm:
- Step sequence matches the logical progression of the original skill.
- Every human interaction point is represented as a `gate` (pause point).
- Conditions properly branch into YES and NO paths without broken links.
