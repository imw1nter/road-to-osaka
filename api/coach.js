// ===== Road to Osaka – AI coach (Vercel serverless function) =====
// POST /api/coach   Authorization: Bearer <Firebase ID token>
// Body: { mode: "review" | "ask", question?, context }
// The Gemini API key stays here on the server (Vercel environment variable GEMINI_API_KEY).

import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "road-to-osaka";
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ALLOWED_ORIGINS = [
  "https://imw1nter.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

// Google's public keys for checking Firebase sign-in tokens
const FIREBASE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// Simple limit: 10 requests per user per 10 minutes (per server instance)
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;
const recentCalls = new Map();

const SYSTEM_PROMPT = `You are a friendly, experienced marathon running coach inside the "Road to Osaka" training app.
The runner is preparing for the Osaka Marathon on 28 February 2027 with a goal time of 3:30:00.
You receive their goal, this week's training plan with what was completed, weekly distances and recent runs as JSON.
Rules:
- Base every comment on the data. Mention real numbers (km, paces, dates) when useful. Do not invent runs.
- Be encouraging but honest. Keep advice practical and specific to the next 7 days.
- Paces are in min:sec per km. Distances in km.
- If notes mention pain or injury, advise rest and seeing a doctor or physiotherapist; do not diagnose.
- Plain text only. You may use short "- " bullet lines and **bold** for a few key words. No headings, no tables.`;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return ALLOWED_ORIGINS.includes(origin);
}

function rateLimited(uid) {
  const now = Date.now();
  const calls = (recentCalls.get(uid) || []).filter((t) => now - t < WINDOW_MS);
  if (calls.length >= LIMIT) return true;
  calls.push(now);
  recentCalls.set(uid, calls);
  return false;
}

// Keep only the fields we expect, with size limits
function cleanContext(ctx) {
  if (!ctx || typeof ctx !== "object") return null;
  const text = (v, max = 60) => String(v ?? "").slice(0, max);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

  return {
    goal: { time: text(ctx.goal?.time), marathonPace: text(ctx.goal?.marathonPace), raceDate: text(ctx.goal?.raceDate), daysLeft: num(ctx.goal?.daysLeft) },
    today: text(ctx.today, 10),
    planWeek: {
      number: num(ctx.planWeek?.number),
      phase: text(ctx.planWeek?.phase),
      plannedKm: num(ctx.planWeek?.plannedKm),
      doneKm: num(ctx.planWeek?.doneKm),
      sessions: list(ctx.planWeek?.sessions, 7).map((s) => ({
        day: text(s.day, 3), date: text(s.date, 10), title: text(s.title), pace: text(s.pace, 12),
        status: text(s.status, 10), loggedKm: num(s.loggedKm),
      })),
    },
    weeklyKm: list(ctx.weeklyKm, 8).map((w) => ({ week: text(w.week, 10), km: num(w.km) })),
    recentRuns: list(ctx.recentRuns, 20).map((r) => ({
      date: text(r.date, 10), type: text(r.type, 12), km: num(r.km), time: text(r.time, 10),
      pace: text(r.pace, 12), effort: num(r.effort), notes: text(r.notes, 120),
    })),
  };
}

export default async function handler(req, res) {
  const allowed = setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!allowed) return res.status(403).json({ error: "This website is not allowed to use the coach." });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "The server is missing its AI API key." });
  }

  // 1. Only signed-in users of this Firebase project
  let uid;
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    uid = payload.sub;
  } catch (err) {
    return res.status(401).json({ error: "Please sign in again to use the coach." });
  }

  if (rateLimited(uid)) {
    return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });
  }

  // 2. Check the request body
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const mode = body?.mode;
  const question = String(body?.question || "").trim().slice(0, 300);
  const context = cleanContext(body?.context);

  if (!["review", "ask"].includes(mode) || !context) {
    return res.status(400).json({ error: "Invalid request." });
  }
  if (mode === "ask" && !question) {
    return res.status(400).json({ error: "Please type a question." });
  }

  const task = mode === "review"
    ? `Write my weekly training review in about 120–170 words:
1) how this week is going compared with the plan (one or two sentences),
2) 2–3 bullet points of what to focus on in the next 7 days,
3) one short motivating sentence about Osaka.`
    : `Answer my question in at most 120 words, using my data where it helps.
Question: ${question}`;

  const prompt = `${task}\n\nMy training data (JSON):\n${JSON.stringify(context)}`;

  // 3. Ask Gemini
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini error", response.status, await response.text());
      const busy = response.status === 429;
      return res.status(busy ? 429 : 502).json({
        error: busy ? "The AI service is busy. Try again in a minute." : "The AI service is not available right now.",
      });
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) return res.status(502).json({ error: "The coach did not reply. Please try again." });
    return res.status(200).json({ text });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Could not reach the AI service." });
  }
}
