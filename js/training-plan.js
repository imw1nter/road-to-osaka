// ===== Road to Osaka – Training plan (generated from the goal time) =====
// A 15-week plan from Monday 16 Nov 2026 to race day, Sunday 28 Feb 2027.
// Sessions are marked "done" automatically when a run is logged on that day.

const PLAN_START = new Date(2026, 10, 16); // Monday 16 Nov 2026 (months start at 0)
const PLAN_WEEKS = 15;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Training paces, worked out from the marathon goal pace
const PACES = {
  easy: GOAL_PACE * 1.2,       // ≈ 5:58 /km
  long: GOAL_PACE * 1.12,      // ≈ 5:34 /km
  marathon: GOAL_PACE,         // ≈ 4:59 /km
  tempo: GOAL_PACE * 0.95,     // ≈ 4:44 /km
  interval: GOAL_PACE * 0.88,  // ≈ 4:23 /km
};

// Week-by-week targets: long-run distance and a volume factor for the other runs
const WEEK_SETUP = [
  { phase: "Base", long: 18, volume: 0.8 },
  { phase: "Base", long: 20, volume: 0.85 },
  { phase: "Base", long: 22, volume: 0.9 },
  { phase: "Base", long: 16, volume: 0.75, cutback: true },
  { phase: "Build", long: 24, volume: 0.95 },
  { phase: "Build", long: 26, volume: 1 },
  { phase: "Build", long: 28, volume: 1.05 },
  { phase: "Build", long: 20, volume: 0.8, cutback: true },
  { phase: "Peak", long: 28, volume: 1.05 },
  { phase: "Peak", long: 30, volume: 1.1 },
  { phase: "Peak", long: 24, volume: 0.9, cutback: true },
  { phase: "Peak", long: 32, volume: 1.1 },
  { phase: "Taper", long: 26, volume: 0.85 },
  { phase: "Taper", long: 18, volume: 0.65 },
  { phase: "Race week", long: 42.195, volume: 0.4 },
];

// ---------- Date helpers ----------

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Date -> "YYYY-MM-DD" (local time)
function dateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// ---------- Building the plan ----------

function session(type, km, title, detail, pace) {
  return { type, km, title, detail, pace };
}

function buildWeek(index) {
  const setup = WEEK_SETUP[index];
  const v = setup.volume;
  const r = (km) => Math.max(3, Math.round(km * v));
  const p = (sec) => formatPace(sec);
  let days;

  if (setup.phase === "Race week") {
    days = [
      session("Rest", 0, "Rest", "Rest and sleep well."),
      session("Easy", 8, "Easy 8 km", "Include 3 km at marathon pace.", p(PACES.easy)),
      session("Easy", 6, "Easy 6 km", "Relaxed and short.", p(PACES.easy)),
      session("Easy", 5, "Easy 5 km", "Very easy.", p(PACES.easy)),
      session("Rest", 0, "Rest", "Travel day – stay off your feet."),
      session("Easy", 3, "Shake-out 3 km", "Very easy + 4 short strides.", p(PACES.easy)),
      session("Race", 42.195, "Osaka Marathon", `Goal 3:30:00 – start at ${p(PACES.marathon)}.`, p(PACES.marathon)),
    ];
  } else {
    // Quality day alternates between intervals and tempo
    const quality = index % 2 === 0
      ? session("Intervals", r(11), `Intervals ${Math.min(8, 5 + Math.floor(index / 3))} × 1 km`,
          "Warm up 2 km, 1 km repeats with 2 min jog, cool down 2 km.", p(PACES.interval))
      : session("Tempo", r(12), `Tempo ${r(12)} km`,
          `Easy start, then ${Math.max(4, r(12) - 4)} km at tempo pace, easy finish.`, p(PACES.tempo));

    // In the build and peak phases the end of the long run is at marathon pace
    const mpFinish = (setup.phase === "Build" || setup.phase === "Peak") && !setup.cutback
      ? ` Last ${Math.round(setup.long / 4)} km at marathon pace (${p(PACES.marathon)}).` : "";

    days = [
      session("Rest", 0, "Rest", "Rest or light stretching."),
      session("Easy", r(10), `Easy ${r(10)} km`, "Conversational pace.", p(PACES.easy)),
      quality,
      session("Easy", r(8), `Easy ${r(8)} km`, "Recovery run – keep it relaxed.", p(PACES.easy)),
      session("Rest", 0, "Rest", "Rest day."),
      session("Easy", r(7), `Easy ${r(7)} km + strides`, "Finish with 4–6 × 100 m strides.", p(PACES.easy)),
      session("Long run", setup.long, `Long run ${setup.long} km`,
        (setup.cutback ? "Recovery week – shorter and easy." : "Steady and easy.") + mpFinish, p(PACES.long)),
    ];
  }

  const monday = addDays(PLAN_START, index * 7);
  days.forEach((s, i) => {
    s.date = dateString(addDays(monday, i));
    s.day = DAY_NAMES[i];
  });

  return {
    number: index + 1,
    phase: setup.phase,
    cutback: Boolean(setup.cutback),
    start: dateString(monday),
    end: dateString(addDays(monday, 6)),
    sessions: days,
    plannedKm: days.reduce((sum, s) => sum + s.km, 0),
  };
}

function buildPlan() {
  return Array.from({ length: PLAN_WEEKS }, (_, i) => buildWeek(i));
}

// ---------- Matching the plan with logged runs ----------

// Adds status to every session: rest, done, short, missed, today, upcoming
function applyRuns(plan, runs) {
  const today = todayString();
  const byDate = {};
  runs.forEach((r) => {
    byDate[r.date] = byDate[r.date] || [];
    byDate[r.date].push(r);
  });

  plan.forEach((week) => {
    week.doneKm = 0;
    week.sessions.forEach((s) => {
      const dayRuns = byDate[s.date] || [];
      const km = dayRuns.reduce((sum, r) => sum + r.distance, 0);
      s.loggedKm = Math.round(km * 10) / 10;
      week.doneKm += km;

      if (s.type === "Rest") s.status = "rest";
      else if (km >= s.km * 0.8) s.status = "done";
      else if (km > 0) s.status = "short";
      else if (s.date < today) s.status = "missed";
      else if (s.date === today) s.status = "today";
      else s.status = "upcoming";
    });
    week.doneKm = Math.round(week.doneKm * 10) / 10;
  });
  return plan;
}

// The week that contains today (or the first / last week if outside the plan)
function currentWeekIndex(plan) {
  const today = todayString();
  if (today < plan[0].start) return 0;
  const i = plan.findIndex((w) => today >= w.start && today <= w.end);
  return i === -1 ? plan.length - 1 : i;
}

function todaysSession(plan) {
  const today = todayString();
  for (const week of plan) {
    const s = week.sessions.find((x) => x.date === today);
    if (s) return s;
  }
  return null;
}
