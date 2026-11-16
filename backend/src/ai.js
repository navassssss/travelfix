// Gemini-powered plan generation for TravelFix.
//
// The model is GROUNDED: it may only use
//   1. the traveller's own words (problem, category, location, destination),
//   2. published community solutions from the database, and
//   3. verified resources from the database.
// It must NEVER invent a phone number, address, official contact, opening
// hour or service availability. Anything it cannot ground must be phrased
// as "ask staff / check the official website" rather than a made-up detail.
// Emergency categories always lead with official help.
//
// If there is no GEMINI_API_KEY, or the Gemini call fails for any reason,
// the caller falls back to the template plan in plan.js — the API never
// fails a case submission because the AI is unavailable.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function aiEnabled() {
  return Boolean((process.env.GEMINI_API_KEY || "").trim());
}

async function callGemini(prompt, timeoutMs = 25000) {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `Gemini request failed (${res.status})`;
      throw new Error(msg);
    }
    const text =
      data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) throw new Error("Gemini returned no text");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("No JSON object in Gemini reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
}

function asIdArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
}

// Build a plan with Gemini, grounded on the DB rows. Returns null on any
// failure so the caller can use the template plan instead.
async function buildAiPlan({ problem, category, location, destination, publishedSolutions, verifiedResources }) {
  if (!aiEnabled()) return null;
  const solutionsText = (publishedSolutions || [])
    .map((s) => `- [id ${s.id}] "${s.title}" (${s.destination || "destination not listed"}): problem: ${s.problem} — solution: ${s.solution}`)
    .join("\n") || "(none)";
  const resourcesText = (verifiedResources || [])
    .map((r) => `- [id ${r.id}] ${r.name} (${r.category}, ${r.destination || "anywhere"}): ${r.description || ""}${r.url ? ` — ${r.url}` : ""}`)
    .join("\n") || "(none)";

  const prompt = [
    "You are TravelFix, a travel problem-solving assistant. Write a help plan for this traveller.",
    "",
    `Problem: ${problem}`,
    `Category: ${category}`,
    `Location: ${location || "not given"}`,
    `Destination: ${destination || "not given"}`,
    "",
    "Published community solutions (personal experience, NOT independently verified — label them as such, never as verified fact):",
    solutionsText,
    "",
    "Verified local resources (you may only mention these, with their exact names and URLs as given):",
    resourcesText,
    "",
    "STRICT RULES:",
    "- Use only the problem above, the listed solutions and the listed resources. Do not invent phone numbers, addresses, official contacts, opening hours, prices or service availability. If a detail is not listed, say to ask local staff or check the provider's official website.",
    "- For Medical Assistance or Safety & Unexpected Situations, the first immediate action must be to get official help (local emergency services / police / medical staff).",
    "- Tailor every step to THIS problem, not to the category in general. Reference the specific place, carrier, item or situation the traveller described.",
    "- If a published solution clearly matches this problem, build the plan around it and cite it.",
    "- Urgency: critical = someone hurt or in immediate danger; high = stranded, passport/cards lost, travel impossible; medium = delay, booking problem, inconvenience; low = minor issue.",
    "",
    "Reply with ONLY a JSON object, no other text:",
    '{ "urgency": "critical|high|medium|low", "summary": "2-3 sentences, specific to this problem", "immediateActions": ["..."], "steps": ["..."], "alternatives": ["..."], "clarificationQuestion": "one question or null", "matchedSolutionIds": [1], "matchedResourceIds": [2] }',
  ].join("\n");

  let parsed;
  try {
    parsed = parseJson(await callGemini(prompt));
  } catch (e) {
    console.error("Gemini plan failed, using template fallback:", e.message);
    return null;
  }
  const urgency = ["critical", "high", "medium", "low"].includes(parsed.urgency) ? parsed.urgency : "medium";
  const steps = asStringArray(parsed.steps);
  const immediate = asStringArray(parsed.immediateActions);
  if (!parsed.summary || typeof parsed.summary !== "string" || steps.length === 0 || immediate.length === 0) {
    console.error("Gemini plan incomplete, using template fallback");
    return null;
  }
  const byId = (rows, ids) => {
    const map = new Map((rows || []).map((r) => [Number(r.id), r]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  };
  const matchedSolutions = byId(publishedSolutions, asIdArray(parsed.matchedSolutionIds));
  const matchedResources = byId(verifiedResources, asIdArray(parsed.matchedResourceIds));
  const sources = [];
  for (const s of matchedSolutions) {
    sources.push({
      kind: "community",
      label: `Community experience: "${s.title}" (${s.destination || "destination not listed"}) — personal experience, not independently verified.`,
      solutionId: s.id,
    });
  }
  for (const r of matchedResources) {
    sources.push({
      kind: "resource",
      label: `Verified resource: ${r.name} — ${r.description || ""}${r.url ? ` (${r.url})` : ""}`,
      resourceId: r.id,
    });
  }
  return {
    urgency,
    summary: parsed.summary.trim(),
    immediateActions: immediate,
    steps,
    alternatives: asStringArray(parsed.alternatives),
    matchedSolutions: matchedSolutions.map((s) => ({ id: s.id, title: s.title, destination: s.destination, problem: s.problem, solution: s.solution })),
    matchedResources: matchedResources.map((r) => ({ id: r.id, name: r.name, category: r.category, destination: r.destination, description: r.description, url: r.url, verified: r.verified })),
    sources,
    clarificationQuestion: typeof parsed.clarificationQuestion === "string" && parsed.clarificationQuestion.trim() ? parsed.clarificationQuestion.trim() : null,
    status: parsed.clarificationQuestion && urgency !== "critical" && urgency !== "high" ? "Clarification Required" : "Solution Ready",
    ai: true,
  };
}

// Answer a follow-up message with Gemini, grounded on the case, the chat
// history and verified resources. Returns null on any failure.
async function buildAiFollowup({ problem, category, location, destination, messages, verifiedResources }) {
  if (!aiEnabled()) return null;
  const history = (messages || []).slice(-10).map((m) => `${m.role}: ${m.content}`).join("\n");
  const resourcesText = (verifiedResources || [])
    .map((r) => `- [id ${r.id}] ${r.name} (${r.category}, ${r.destination || "anywhere"}): ${r.description || ""}${r.url ? ` — ${r.url}` : ""}`)
    .join("\n") || "(none)";
  const prompt = [
    "You are TravelFix, a travel problem-solving assistant, answering a follow-up from a traveller whose case is below.",
    "",
    `Original problem: ${problem} (category ${category}, location ${location || "not given"}, destination ${destination || "not given"})`,
    "",
    "Conversation so far:",
    history,
    "",
    "Verified local resources (you may only mention these, with their exact names and URLs as given):",
    resourcesText,
    "",
    "STRICT RULES: answer ONLY from the case, the conversation and the listed resources. Do not invent phone numbers, addresses, official contacts, opening hours, prices or availability. If you do not know a detail, say to ask local staff or check the provider's official website. Keep the reply short (2-4 sentences) and practical — tell them the next concrete thing to try.",
    "",
    "Reply with ONLY a JSON object: { \"reply\": \"...\" }",
  ].join("\n");
  try {
    const parsed = parseJson(await callGemini(prompt));
    if (!parsed.reply || typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
    return parsed.reply.trim();
  } catch (e) {
    console.error("Gemini follow-up failed, using template fallback:", e.message);
    return null;
  }
}

module.exports = { aiEnabled, buildAiPlan, buildAiFollowup };
