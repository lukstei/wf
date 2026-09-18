- Prefer snapshot testing instead of a list of assertions
- Always place workflow state transitions and status mutations in `src/transitions.ts`
- Run `npm run verify` after each change
- Keep the code as clean and pure as possible
  - no unnecessary condition checking
  - no over-defensive programming (instead assert preconditions at the start of functions using `assert` from `src/lib/assert.ts`)
  - no unnecessary optional types
  - No unnecessary exporting of internal types
  - Especially no unnecessary states, always think about how to keep the state minimal
  - Prefer inline types, if the type is not reused
  - Prefer discriminated unions
- No use of any or unjustified type castings
- Never change the git state without confirmation
- Use /no-ai-slop for all texts intended for humans
- Reference implementations for cross-agent integrations:
  - Universal packaging & shims: `ponytail` (`~/.gemini/config/plugins/ponytail/`, analyzed in `docs/packaging.md`)
  - Loop interception (`Stop` hook): `ralph-loop` (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/ralph-loop/`)
  - Skill discovery: `superpowers` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.0/`)
- Use /find-docs ctx-7 for docs for external libs

## Source File Map (`src/`)

### Root (`src/`)
- `cli.ts`: Entry point for the CLI, parsing subcommands and flags.
- `wf.ts`: Deterministic hook dispatcher routing agent lifecycle events to the corresponding handler.
- `workflow.ts`: Defines workflow step AST types and flattens nested workflow trees into indexed step sequences.
- `transitions.ts`: Pure state transition functions and status mutations for workflow lifecycles.
- `state.ts`: Reads, writes, and paths workflow state files on disk keyed by conversation ID.
- `resolver.ts`: Locates and parses workflow files across workspace folders and search paths.
- `validator.ts`: Validates workflow syntax, structural integrity, and step connections against workflow schemas.
- `types.ts`: TypeScript interfaces for agent hook payloads, egress responses, and execution results.
- `test-utils.ts`: Test utilities for path stripping and snapshot normalization across environments.

### Subsystems
- `actions/`: Implements runner actions and output formatters.
- `handlers/pre.ts`: Handles the pre-execution lifecycle hook, intercepting commands and user prompts.
- `handlers/stop.ts`: Handles the loop-completion lifecycle hook, evaluating decisions and injecting pending steps.
- `harnesses/`: Adapters for agent environments that detect the active agent and normalize ingress and egress.
- `lib/assert.ts`: Assertion helper that enforces preconditions and invariant checks.
- `lib/getLatestMessage.ts`: Extracts the latest message from conversation transcript files across harnesses.
- `lib/logDebug.ts`: File-based debug logger active when debug flags are set.
- `lib/markdown/`: Parses Markdown workflow files, AST structures, and frontmatter into workflow definitions.
- `lib/parseCommand.ts`: Extracts and parses runner slash commands from text inputs.
- `lib/visualize.ts`: Generates Mermaid diagrams and progress summaries from workflow state.
- `shim/runtime-shim.ts`: Entry point for agent hook execution, detecting the harness and dispatching to `wf.ts`.
- `shim/stdin.ts`: Reads and parses JSON payloads from standard input with timeout handling.
