import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fs from "node:fs";
import path from "node:path";

const token = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.github.ai/inference";
const model = process.env["GITHUB_LLAMA_MODEL"] || "meta-llama/Llama-2-70b-chat-hf";

const JSON_TEMPLATE = {
  tc_id: "TC-HEALTH-XXX",
  purpose: "Verify <what behavior is validated>",
  priority: "HIGH | MEDIUM | LOW",
  classification: "<e.g., boundary/functional (boundary_below)>",
  preconditions: ["<state/system setup 1>", "<state/system setup 2>"],
  dependencies: ["<optional dependency 1>"],
  inputs: {
    "<input_name>": "<value>",
    "<input_name_2>": "<value>"
  },
  steps: ["1. <action step 1>", "2. <action step 2>", "3. <action step 3>"],
  expected_result: "<observable expected outcome>",
  suspension_criteria: "<when execution should be stopped>",
  postconditions: "<system state after execution>",
  source_requirement: "<exact SRS statement>",
  rule_id: "RULE-XXX",
  scenario_id: "SC-XXX",
  strategy: "BVA | EP | STATE_TRANSITION | DECISION_TABLE | TEMPORAL | CLINICAL_VALIDATION"
};

function getRequirementText() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--srs-file");
  if (fileIdx !== -1) {
    const filePath = args[fileIdx + 1];
    if (!filePath) {
      throw new Error("Missing file path after --srs-file.");
    }

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`SRS file not found: ${resolved}`);
    }

    const text = fs.readFileSync(resolved, "utf8").trim();
    if (!text) {
      throw new Error(`SRS file is empty: ${resolved}`);
    }
    return text;
  }

  if (args.length >= 1) {
    const candidate = path.resolve(args[0]);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const text = fs.readFileSync(candidate, "utf8").trim();
      if (!text) {
        throw new Error(`SRS file is empty: ${candidate}`);
      }
      return text;
    }
  }

  const cliInput = args.join(" ").trim();
  if (cliInput) return cliInput;

  return [
    "Patient eligibility validation for medication order:",
    "1) Age must be between 18 and 65 inclusive.",
    "2) Systolic BP must be < 180 mmHg.",
    "3) If allergy flag is true, ordering this medication is blocked.",
    "4) Dose adjustment must occur within 24 hours after renal function changes.",
    "5) Critical lab alerts must suspend order processing until clinician acknowledgment."
  ].join("\n");
}

function getOutputPath() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  if (outIdx === -1) {
    if (args.length >= 2) {
      return path.resolve(args[1]);
    }
    return "";
  }

  const outputPath = args[outIdx + 1];
  if (!outputPath) {
    throw new Error("Missing file path after --out.");
  }
  return path.resolve(outputPath);
}

function unwrapJson(text) {
  if (!text) {
    throw new Error("Model returned empty content.");
  }

  // Try to extract JSON from code blocks or raw text
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (codeBlockMatch ? codeBlockMatch[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error(
      "Failed to parse model output as JSON. Raw output:\n" + text
    );
  }
}

function extractContent(response) {
  const message = response?.body?.choices?.[0]?.message;
  if (!message) return "";

  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function buildPrompt(requirementText) {
  return [
    "Generate healthcare-focused software test cases as strict JSON.",
    "Output must be a JSON array only (no prose, no markdown, no comments).",
    "Use this exact schema and field names for each test case:",
    JSON.stringify(JSON_TEMPLATE, null, 2),
    "Mandatory strategy coverage: include test cases for BVA, STATE_TRANSITION, TEMPORAL, CLINICAL_VALIDATION.",
    "You may include EP and DECISION_TABLE additionally where relevant.",
    "Rules:",
    "- tc_id format: TC-HEALTH-001, TC-HEALTH-002, ...",
    "- priority must be one of HIGH, MEDIUM, LOW",
    "- strategy must be one of BVA, EP, STATE_TRANSITION, DECISION_TABLE, TEMPORAL, CLINICAL_VALIDATION",
    "- source_requirement must quote exact requirement text fragment used",
    "- steps must be numbered strings starting with '1. '",
    "- Ensure clinically safe expected_result and suspension_criteria",
    "- Return at least 8 test cases",
    "Requirements:",
    requirementText
  ].join("\n\n");
}

export async function main() {
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. Set it in your environment before running."
    );
  }

  const requirementText = getRequirementText();

  console.error(`[Llama] Using GitHub Models endpoint with model: ${model}`);

  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  const response = await client.path("/chat/completions").post({
    body: {
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA engineer for healthcare systems. Produce compliant, deterministic JSON only. Output ONLY valid JSON array (no markdown, no code blocks, no prose)."
        },
        {
          role: "user",
          content: buildPrompt(requirementText)
        }
      ],
      model,
      temperature: 0.2
    }
  });

  if (isUnexpected(response)) {
    console.error("API Response Error:", response.body);
    throw new Error(`GitHub Models API error: ${JSON.stringify(response.body)}`);
  }

  const content = extractContent(response);
  if (!content) {
    throw new Error("No content received from model");
  }

  const json = unwrapJson(content);
  const output = JSON.stringify(json, null, 2);
  const outPath = getOutputPath();

  if (outPath) {
    fs.writeFileSync(outPath, output + "\n", "utf8");
    console.error(`[Llama] Saved generated test cases to: ${outPath}`);
  }

  console.log(output);
}

main().catch((err) => {
  console.error("Llama generation failed:", err.message || err);
  process.exitCode = 1;
});
