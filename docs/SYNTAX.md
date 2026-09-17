# Workflow Syntax Reference (`wf`)

> Markdown runbooks compiled into deterministic step graphs for AI coding agents.

---

## 1. Core Mental Model

- **One Step at a Time**: The agent only receives instructions for the currently active step. Future steps remain hidden.
- **Headings Define the Graph**:
  - `##` headings define top-level linear steps, conditions, and gates.
  - `###` child headings under an `If` condition define branch steps.
- **No Mystery State**: All text directly under a step heading belongs to that step's instructions.

---

## 2. Frontmatter & Global Context

### Frontmatter (Optional)
Metadata at the top of the file:
```markdown
---
name: deploy-prod
description: Staging to production deployment pipeline
---
```

### Title & Global Preamble
The `# H1` heading names the workflow (if frontmatter `name` is omitted). Any text between the H1 title and the first `##` step heading is the **Global Preamble**, injected into every step under `CONTEXT:`:

```markdown
# Production Deployment

Ensure all git submodules are updated and AWS credentials are active.
Commands must run from repository root.
```

---

## 3. Linear Steps (`##`)

Any H2 heading that is not a keyword (`if`, `gate`) creates an executable step. Prefixes and numbers are automatically supported:

```markdown
## 1. Run migrations
Run `./scripts/migrate.sh` and verify all database tables migrate cleanly.
```
- **Title**: `1. Run migrations`
- **Instruction**: `Run ./scripts/migrate.sh and verify all database tables migrate cleanly.`

---

## 4. Human Approval Gates (`## Gate:`)

Steps marked with `gate` halt automatic agent execution and wait for human review:

```markdown
## Gate: Confirm release build
Review the generated files in `dist/`. Ask the user if they are ready to publish.
```
- The agent completes the instructions, then stops.
- Execution pauses until the user explicitly runs `/wf-next` (to approve and continue) or `/wf-stop` (to cancel).

---

## 5. Conditional Branching (`## If:` / `### No`)

Conditions provide binary routing evaluated dynamically by the model.

### Anatomy
- **`## If: <condition>`**: The heading declares the condition to evaluate.
- **Condition Instruction**: Body text directly beneath `## If:` (before any child headings) tells the agent *how* to evaluate the condition. If omitted, defaults to evaluating the condition title.
- **YES Branch (0..N steps)**: Any child `###` subheadings under `## If:` are regular steps executed when the condition evaluates to `YES`.
- **NO Branch (Optional)**: A child heading named `### No` (or `### Else`) marks the NO branch step(s).

The agent executes the condition step using its tools, and must conclude its turn with either:
`[DECISION: YES]` or `[DECISION: NO]`.

---

### Supporting Examples

#### Example 1: Evaluation Instructions + Both Branches
```markdown
## 2. If: Any migrations pending?
Run `npx prisma migrate status` to check the database state.

### Run dry-run
Run migration dry-run and save output to `migration.log`.

### No: Skip verification
Skip to schema verification.
```
- **Condition Step**: The agent is instructed to run `npx prisma migrate status` and decide YES or NO.
- **If YES**: Runs `Run dry-run`.
- **If NO**: Runs `Skip verification`.

#### Example 2: Multi-Step YES Branch
```markdown
## 2. If: Any migrations pending?
Run `npx prisma migrate status`.

### 1. Run dry-run
Run migration dry-run and inspect generated SQL.

### 2. Apply migration
Run `npx prisma migrate deploy`.

### No
Log that schema is already up to date.
```

#### Example 3: Simple Condition (No Evaluation Instruction Needed)
When the question is self-explanatory or based on context from a prior step:
```markdown
## 1. Run tests
Run `npm run verify`.

## 2. If: Did all tests pass?

### Publish packages
Publish packages to npm and create GitHub release.

### No: Stop release
Report test failures to user and abort deployment.
```

#### Example 4: Optional NO Branch (If-Only)
If no `### No` / `### Else` is provided, a `[DECISION: NO]` simply jumps past the condition's child steps to the next top-level step:
```markdown
## 2. If: Cache enabled?
Check if `ENABLE_CACHE=true` in `.env`.

### Warm cache
Connect to Redis and pre-warm keys.

## 3. Start Server
Run `npm start`.
```

---

## 6. Quick Reference Table

| Syntax | Heading Level | Role | Content |
| :--- | :--- | :--- | :--- |
| `# Title` | H1 | Workflow Name | Optional title; fallback to filename |
| `Preamble text` | Body under H1 | Global Context | Injected into all steps under `CONTEXT:` |
| `## <Title>` | H2 | Linear Step | Body text is the step instruction |
| `## Gate: <Title>` | H2 | Human Gate | Body is instructions; pauses for `/wf-next` |
| `## If: <Condition>` | H2 | Condition Evaluation | Body is evaluation instructions (`[DECISION: YES/NO]`) |
| `### <Title>` | H3 under `If` | YES Branch Step | Executed sequentially when decision is `YES` |
| `### No` / `### Else` | H3 under `If` | NO Branch Step | Executed when decision is `NO` |
