import { describe, expect, it } from "vitest";
import { validateWorkflow } from "./validator.ts";
import type { WorkflowDef } from "./workflow.ts";

describe("validateWorkflow", () => {
	it("validates a well-formed workflow with snapshot", () => {
		const validDef: WorkflowDef = {
			name: "Deploy Service",
			description: "Continuous deployment pipeline",
			steps: [
				{
					type: "step",
					title: "1. Run Tests",
					instruction: "Execute npm run verify.",
				},
				{
					type: "condition",
					title: "2. Check Migration",
					condition: "Are migrations pending?",
					yes: {
						steps: [
							{
								type: "step",
								title: "Apply Migration",
								instruction: "Run migration command.",
							},
						],
					},
					no: {
						steps: [
							{
								type: "step",
								title: "Log Status",
								instruction: "Migrations already up to date.",
							},
						],
					},
				},
				{
					type: "gate",
					title: "3. Confirm Production Release",
					instruction: "Present staging test report to user for sign-off.",
				},
			],
		};

		const result = validateWorkflow(validDef);
		expect(result).toMatchInlineSnapshot(`
			{
			  "problems": [],
			  "stats": {
			    "conditions": 1,
			    "gates": 1,
			    "linearSteps": 3,
			    "totalSteps": 5,
			  },
			  "valid": true,
			}
		`);
	});

	it("captures validation errors for malformed workflows", () => {
		const cases = [
			// 1. Missing name
			validateWorkflow({
				name: "",
				steps: [
					{
						type: "step",
						title: "Step 1",
						instruction: "Do work",
					},
				],
			}),
			// 2. Empty steps
			validateWorkflow({
				name: "Empty Workflow",
				steps: [],
			}),
			// 3. Step with empty instruction
			validateWorkflow({
				name: "Broken Action",
				steps: [
					{
						type: "step",
						title: "Empty Step",
						instruction: "   ",
					},
				],
			}),
			// 4. Condition with empty condition and empty YES branch
			validateWorkflow({
				name: "Broken Condition",
				steps: [
					{
						type: "condition",
						title: "Empty Condition",
						condition: "",
						yes: { steps: [] },
					},
				],
			}),
			// 5. Gate with empty instruction
			validateWorkflow({
				name: "Broken Gate",
				steps: [
					{
						type: "gate",
						title: "Gate Check",
						instruction: "",
					},
				],
			}),
			// 6. Missing description warning
			validateWorkflow({
				name: "No Description",
				steps: [
					{
						type: "step",
						title: "Step 1",
						instruction: "Run job",
					},
				],
			}),
			// 7. Empty NO branch warning
			validateWorkflow({
				name: "Empty Else",
				description: "Has description",
				steps: [
					{
						type: "condition",
						title: "Check Something",
						condition: "Is active?",
						yes: {
							steps: [
								{
									type: "step",
									title: "Yes step",
									instruction: "Do yes",
								},
							],
						},
						no: { steps: [] },
					},
				],
			}),
		];

		expect(cases).toMatchInlineSnapshot(`
			[
			  {
			    "problems": [
			      {
			        "description": "Workflow must define a non-empty name (via YAML frontmatter "name" or Markdown H1 title).",
			        "id": "workflow-missing-name",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "error",
			      },
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			    ],
			    "stats": {
			      "conditions": 0,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 1,
			    },
			    "valid": false,
			  },
			  {
			    "problems": [
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			      {
			        "description": "Workflow contains no actionable steps.",
			        "id": "workflow-no-steps",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "error",
			      },
			    ],
			    "stats": {
			      "conditions": 0,
			      "gates": 0,
			      "linearSteps": 0,
			      "totalSteps": 0,
			    },
			    "valid": false,
			  },
			  {
			    "problems": [
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			      {
			        "description": "Action step "Empty Step" has empty instructions.",
			        "id": "step-action-empty-instruction",
			        "source": {
			          "title": "Empty Step",
			          "type": "step",
			        },
			        "type": "error",
			      },
			    ],
			    "stats": {
			      "conditions": 0,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 1,
			    },
			    "valid": false,
			  },
			  {
			    "problems": [
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			      {
			        "description": "Condition step "Empty Condition" has an empty condition expression.",
			        "id": "step-condition-empty-expression",
			        "source": {
			          "title": "Empty Condition",
			          "type": "step",
			        },
			        "type": "error",
			      },
			      {
			        "description": "Condition step "Empty Condition" has no YES branch steps.",
			        "id": "step-condition-empty-yes",
			        "source": {
			          "title": "Empty Condition",
			          "type": "step",
			        },
			        "type": "error",
			      },
			    ],
			    "stats": {
			      "conditions": 1,
			      "gates": 0,
			      "linearSteps": 0,
			      "totalSteps": 1,
			    },
			    "valid": false,
			  },
			  {
			    "problems": [
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			      {
			        "description": "Gate step "Gate Check" has empty verification instructions.",
			        "id": "step-gate-empty-instruction",
			        "source": {
			          "title": "Gate Check",
			          "type": "step",
			        },
			        "type": "error",
			      },
			    ],
			    "stats": {
			      "conditions": 0,
			      "gates": 1,
			      "linearSteps": 0,
			      "totalSteps": 1,
			    },
			    "valid": false,
			  },
			  {
			    "problems": [
			      {
			        "description": "Workflow lacks a description in YAML frontmatter.",
			        "id": "workflow-missing-description",
			        "source": {
			          "type": "workflow",
			        },
			        "type": "warning",
			      },
			    ],
			    "stats": {
			      "conditions": 0,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 1,
			    },
			    "valid": true,
			  },
			  {
			    "problems": [
			      {
			        "description": "Condition step "Check Something" defines an empty NO branch.",
			        "id": "step-condition-empty-no",
			        "source": {
			          "title": "Check Something",
			          "type": "step",
			        },
			        "type": "warning",
			      },
			    ],
			    "stats": {
			      "conditions": 1,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 2,
			    },
			    "valid": true,
			  },
			]
		`);
	});
});
