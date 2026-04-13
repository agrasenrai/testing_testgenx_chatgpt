# GitHub Models Test Case Generator

This project calls GitHub Models using `@azure-rest/ai-inference` and generates test cases in a strict JSON template.

## 1) Install dependencies

```powershell
npm install
```

## 2) Set your GitHub token

Use an environment variable (do not hardcode secrets in source):

```powershell
$env:GITHUB_TOKEN = "<YOUR_GITHUB_PAT>"
```

Optional model override:

```powershell
$env:GITHUB_MODEL = "openai/gpt-5"
```

## 3) Run with your requirement text

```powershell
npm run generate:tcs -- "Age must be 18-65; if allergy flag true block order; acknowledge critical alert before processing"
```

If no CLI requirement is supplied, a built-in healthcare sample requirement is used.

## Output format

The script prints a JSON array of test cases, each matching this template:

```json
{
  "tc_id": "TC-HEALTH-XXX",
  "purpose": "Verify <what behavior is validated>",
  "priority": "HIGH | MEDIUM | LOW",
  "classification": "<e.g., boundary/functional (boundary_below)>",
  "preconditions": [
    "<state/system setup 1>",
    "<state/system setup 2>"
  ],
  "dependencies": [
    "<optional dependency 1>"
  ],
  "inputs": {
    "<input_name>": "<value>",
    "<input_name_2>": "<value>"
  },
  "steps": [
    "1. <action step 1>",
    "2. <action step 2>",
    "3. <action step 3>"
  ],
  "expected_result": "<observable expected outcome>",
  "suspension_criteria": "<when execution should be stopped>",
  "postconditions": "<system state after execution>",
  "source_requirement": "<exact SRS statement>",
  "rule_id": "RULE-XXX",
  "scenario_id": "SC-XXX",
  "strategy": "BVA | EP | STATE_TRANSITION | DECISION_TABLE | TEMPORAL | CLINICAL_VALIDATION"
}
```

Mandatory strategy coverage is enforced in the generation prompt: `BVA`, `STATE_TRANSITION`, `TEMPORAL`, and `CLINICAL_VALIDATION`.
