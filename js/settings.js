// ===== Road to Osaka – user settings (goal, paces, weekly structure, plan edits) =====
// Saved in localStorage and, when signed in, in Firestore at users/{uid}/profile/settings
// (js/firebase.js keeps the two in sync). Every page reads its settings from here.

const SETTINGS_KEY = "rto-settings";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SESSION_TYPES = ["Rest", "Easy", "Long run", "Tempo", "Intervals", "Race"];

const DEFAULT_SETTINGS = {
  goalTime: 3 * 3600 + 30 * 60, // 3:30:00 in seconds
  raceDate: "2027-02-28",
  planStart: "2026-11-16",      // a Monday
  // Your own paces in seconds per km as [fastest, slowest]; null = worked out from the goal
  paces: { easy: null, long: null, marathon: null, tempo: null, interval: null },
  // Weekly structure: day numbers 0 = Mon … 6 = Sun
  runDays: [1, 2, 3, 5, 6],     // Tue, Wed, Thu, Sat, Sun
  longRunDay: 6,                // Sunday
  overrides: {},                // edited sessions: { "YYYY-MM-DD": { type, km, pace, detail } }
  customPlan: null,             // imported plan: { name, importedAt, sessions: [...] }
  updatedAt: 0,
};

// Pace ranges worked out from the marathon goal pace: [seconds faster/slower than goal pace]
const PACE_OFFSETS = {
  easy: [60, 100],      // 3:30 goal → 6:00–6:40 /km
  long: [35, 70],       // → 5:34–6:09 /km
  marathon: [0, 0],     // → 4:59 /km
  tempo: [-25, -15],    // → 4:34–4:44 /km
  interval: [-45, -30], // → 4:14–4:29 /km
};

// ---------- Load / save ----------

function loadSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  } catch (err) {
    /* broken data – use defaults */
  }
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  s.paces = { ...DEFAULT_SETTINGS.paces, ...(s.paces || {}) };
  s.overrides = s.overrides || {};
  if (!Array.isArray(s.runDays) || s.runDays.length < 3) s.runDays = DEFAULT_SETTINGS.runDays;
  if (!s.runDays.includes(s.longRunDay)) s.longRunDay = Math.max(...s.runDays);
  return s;
}

// Saves locally, tells the other scripts, and sends to the cloud when signed in
function saveSettings(settings, { fromCloud = false } = {}) {
  if (!fromCloud) settings.updatedAt = Date.now();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (!fromCloud && window.cloudSync && window.cloudSync.saveSettings) {
    window.cloudSync.saveSettings(settings).catch((err) => console.error("Settings not saved to cloud:", err));
  }
  window.dispatchEvent(new Event("settings-changed"));
}

function updateSettings(changes) {
  const s = { ...loadSettings(), ...changes };
  saveSettings(s);
  return s;
}

// ---------- Goal and race ----------

function goalTime() {
  return loadSettings().goalTime;
}

function goalPace() {
  return goalTime() / 42.195;
}

// Race start: 9:15 in Japan on the race date
function raceDateTime() {
  return new Date(`${loadSettings().raceDate}T09:15:00+09:00`);
}

function formatRaceDate(options = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
  return toLocalDate(loadSettings().raceDate).toLocaleDateString("en-GB", options);
}

// ---------- Paces ----------

// Paces worked out from a goal time only. Ranges are rounded to 5 seconds (6:00–6:40, not 5:59–6:39).
function autoPaceRanges(goal) {
  const mp = goal / 42.195;
  const round5 = (sec) => Math.round(sec / 5) * 5;
  const out = {};
  Object.keys(PACE_OFFSETS).forEach((key) => {
    const [a, b] = PACE_OFFSETS[key];
    out[key] = key === "marathon" ? [Math.round(mp), Math.round(mp)] : [round5(mp + a), round5(mp + b)];
  });
  return out;
}

// { easy: [min, max], ... } in seconds per km – your own pace if set, otherwise from the goal
function paceRanges() {
  const s = loadSettings();
  const auto = autoPaceRanges(s.goalTime);
  const out = {};
  Object.keys(PACE_OFFSETS).forEach((key) => {
    const own = s.paces[key];
    out[key] = Array.isArray(own) && own.length === 2 ? own : auto[key];
  });
  return out;
}

// [360, 400] -> "6:00–6:40 /km"; [299, 299] -> "4:59 /km"
function formatPaceRange(range) {
  if (!range) return "";
  const [a, b] = range;
  const one = (sec) => formatPace(sec).replace(" /km", "");
  return Math.round(a) === Math.round(b) ? formatPace(a) : `${one(a)}–${one(b)} /km`;
}

// "6:00-6:40", "6:00–6:40 /km" or "5:30" -> [360, 400] / [330, 330]; "" -> null; bad -> undefined
function parsePaceRange(text) {
  const clean = String(text || "").replace(/\/\s*km/i, "").trim();
  if (!clean) return null;
  const parts = clean.split(/\s*[-–~]\s*/);
  if (parts.length > 2) return undefined;
  const secs = parts.map((p) => {
    const m = p.match(/^(\d{1,2}):(\d{2})$/);
    return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  });
  if (secs.some((x) => !(x >= 120 && x <= 900))) return undefined; // 2:00–15:00 /km
  return [Math.min(...secs), Math.max(...secs)];
}

// "3:30:00" or "3:30" -> seconds (marathon goal), null if not valid (2:00:00–8:00:00)
function parseGoalTime(text) {
  const parts = String(text || "").trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const [h, m, s = 0] = parts;
  if (m > 59 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total >= 7200 && total <= 28800 ? total : null;
}
