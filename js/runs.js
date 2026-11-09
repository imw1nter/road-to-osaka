// ===== Road to Osaka – run data (shared by every page) =====
// Runs are saved in the browser with localStorage.
// In Week 4 these functions will be switched to Firebase.

const STORAGE_KEY = "rto-runs";

// ---------- Load / save ----------
function loadRuns() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Could not read saved runs:", err);
    return [];
  }
}

function saveRuns(runs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

function addRun(run) {
  const runs = loadRuns();
  run.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  run.createdAt = new Date().toISOString();
  runs.push(run);
  saveRuns(runs);
  return run;
}

function updateRun(id, changes) {
  const runs = loadRuns().map((r) => (r.id === id ? { ...r, ...changes } : r));
  saveRuns(runs);
}

function deleteRun(id) {
  saveRuns(loadRuns().filter((r) => r.id !== id));
}

// Newest first
function sortRuns(runs) {
  return [...runs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// ---------- Time and pace helpers ----------

// "1:05:30" or "55:00" -> seconds. Returns null if the format is wrong.
function parseTime(text) {
  const parts = text.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, ...nums];
  if (m > 59 || s > 59) return null;

  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

// seconds -> "1:05:30" or "55:00"
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// seconds per km -> "5:41 /km"
function formatPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "--:-- /km";
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function paceOf(run) {
  return run.seconds / run.distance;
}

// ---------- Dates ----------

// Today as "YYYY-MM-DD" in the user's own time zone
function todayString() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// "2026-11-10" -> Date at local midnight
function toLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Monday 00:00 of the current week
function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

function formatDate(dateStr) {
  return toLocalDate(dateStr).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// ---------- Summaries ----------

function summarize(runs) {
  const distance = runs.reduce((sum, r) => sum + r.distance, 0);
  const seconds = runs.reduce((sum, r) => sum + r.seconds, 0);
  return {
    count: runs.length,
    distance,
    seconds,
    pace: distance > 0 ? seconds / distance : NaN,
  };
}