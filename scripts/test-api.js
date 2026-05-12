const { ThinkFeel } = require("../dist");

const apiKey = process.env.THINKFEEL_API_KEY;
const personaId = process.env.THINKFEEL_PERSONA_ID;
const baseUrl =
  process.env.THINKFEEL_BASE_URL || "https://playground.curvelabs.org";
const prompt =
  process.env.THINKFEEL_TEST_PROMPT ||
  "hey, can you answer this in a way that naturally splits into a few short messages?";

function requireEnv(name, value) {
  if (value) return;
  throw new Error(`Missing ${name}. Set it before running this script.`);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const data = await readJsonResponse(response);
  if (response.ok) return data;

  const message = data.message || data.error || `HTTP ${response.status}`;
  throw new Error(`${path} failed: ${message}`);
}

function logChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    console.log("Chunks: []");
    return;
  }

  console.log("Chunks:");
  chunks.forEach((chunk, index) => console.log(`  ${index + 1}. ${chunk}`));
}

async function main() {
  requireEnv("THINKFEEL_API_KEY", apiKey);
  requireEnv("THINKFEEL_PERSONA_ID", personaId);

  const thinkFeel = new ThinkFeel({ apiKey, personaId, baseUrl });

  console.log("Testing /api/v1/generate");
  const generateResponse = await thinkFeel.generate({
    includeVariations: true,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("Final reply:", generateResponse.finalReply);
  logChunks(generateResponse.chunks);
  console.log("Reply choices:", generateResponse.replyChoices || []);
  console.log("Rate limits:", generateResponse.rateLimits || []);

  console.log("\nTesting /api/v1/completions");
  const completionsResponse = await postJson("/api/v1/completions", {
    n: 2,
    prompt,
    model: personaId,
  });

  for (const choice of completionsResponse.choices || []) {
    console.log(`Choice ${choice.index}:`, choice.text);
    logChunks(choice.chunks);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
