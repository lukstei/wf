---
name: wf-show
description: Visualize workflow status, diagram, and current position (/wf-show [<workflow-file>])
disable-model-invocation: true
---

The wf-show command visualizes a workflow and will be intercepted by the workflow runner hook.

Usage:
  /wf-show                   - Show current workflow status, diagram, and active step.
  /wf-show <workflow-file>   - Visualize a specific workflow from a Markdown (.md) or JSON (.json) file.
