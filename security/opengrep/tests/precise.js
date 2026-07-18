// Fixtures for the precise rulepack, checked by `semgrep --test`.
//   ruleid: <id>  -> the next line MUST be flagged by that rule
//   ok: <id>      -> the next line must NOT be flagged
// These are not run; the undefined identifiers only need to parse.

// --- hardcoded-secret ---
// ruleid: hardcoded-secret
const apiKey = "sk-abcdefghijklmnopqrstuvwx";
// ok: hardcoded-secret
const greeting = "hello world";
// ok: hardcoded-secret
const apiKeyFromEnv = process.env.API_KEY;

// --- dangerous-eval ---
// ruleid: dangerous-eval
eval(userInput);
// ok: dangerous-eval
const parsed = JSON.parse(userInput);

// --- ssrf-fetch-from-request ---
// ruleid: ssrf-fetch-from-request
fetch(`https://api.example.com/${req.nextUrl.searchParams.get("target")}`);
// ok: ssrf-fetch-from-request
fetch(`https://api.open-meteo.com/v1/forecast?city=${city}`);

// --- tool-output-in-prompt ---
// ruleid: tool-output-in-prompt
const message = { role: "system", content: `Context: ${toolResult}` };
// ok: tool-output-in-prompt
const systemMessage = { role: "system", content: "You are a helpful assistant." };
