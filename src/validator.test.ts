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
			  "stats": {
			    "conditions": 1,
			    "gates": 1,
			    "linearSteps": 3,
			    "totalSteps": 5,
			  },
			  "valid": true,
			  "warnings": [],
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
			    "errors": [
			      {
			        "message": "Workflow must define a non-empty name (via YAML frontmatter "name" or Markdown H1 title).",
			      },
			    ],
			    "valid": false,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "errors": [
			      {
			        "message": "Workflow contains no actionable steps.",
			      },
			    ],
			    "valid": false,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "errors": [
			      {
			        "message": "Action step "Empty Step" has empty instructions.",
			        "stepTitle": "Empty Step",
			      },
			    ],
			    "valid": false,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "errors": [
			      {
			        "message": "Condition step "Empty Condition" has an empty condition expression.",
			        "stepTitle": "Empty Condition",
			      },
			      {
			        "message": "Condition step "Empty Condition" has no YES branch steps.",
			        "stepTitle": "Empty Condition",
			      },
			    ],
			    "valid": false,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "errors": [
			      {
			        "message": "Gate step "Gate Check" has empty verification instructions.",
			        "stepTitle": "Gate Check",
			      },
			    ],
			    "valid": false,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "stats": {
			      "conditions": 0,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 1,
			    },
			    "valid": true,
			    "warnings": [
			      {
			        "message": "Workflow lacks a description in YAML frontmatter.",
			      },
			    ],
			  },
			  {
			    "stats": {
			      "conditions": 1,
			      "gates": 0,
			      "linearSteps": 1,
			      "totalSteps": 2,
			    },
			    "valid": true,
			    "warnings": [
			      {
			        "message": "Condition step "Check Something" defines an empty NO branch.",
			        "stepTitle": "Check Something",
			      },
			    ],
			  },
			]
		`);
	});
});
