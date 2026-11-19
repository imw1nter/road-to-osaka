// ===== Road to Osaka – Training plan =====
// Builds the week-by-week plan from your settings (js/settings.js):
//   - generated from your goal, paces and weekly structure, OR
//   - your own imported plan (CSV)
// then applies the sessions you edited by hand. Sessions are marked "done"
// automatically when a run is logged on that day.

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

// Monday of the week that contains this "YYYY-MM-DD" date
function mondayOn(dateStr) {
  const d = toLocalDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function dayIndex(dateStr) {
  return (toLocalDate(dateStr).getDay() + 6) % 7; // Mon = 0 … Sun = 6
}

function sessionTitle(type, km) {
  if (type === "Rest") return "Rest";
  if (type === "Race") return "Race day";
  return `${type} ${Math.round(km * 10) / 10} km`;
}

// ---------- Week-by-week targets for the generated plan ----------

// Long-run distance, volume factor and phase for every week before race week
function weekTargets(weeks) {
  const taper = weeks >= 6 ? 2 : weeks >= 4 ? 1 : 0;
  const build = Math.max(0, weeks - 1 - taper);
  const targets = [];

  // Every 4th week is an easier recovery week
  const normal = [...Array(build).keys()].filter((i) => i % 4 !== 3);
  const startLong = 16;
  const peakLong = build >= 8 ? 32 : build >= 5 ? 28 : 24;

  let lastLong = startLong;
  for (let i = 0; i < build; i++) {
    const cutback = i % 4 === 3 && i < build - 1;
    const step = normal.indexOf(i);
    const long = cutback
      ? Math.round(lastLong * 0.75)
      : Math.round(startLong + ((peakLong - startLong) * Math.max(step, 0)) / Math.max(normal.length - 1, 1));
    if (!cutback) lastLong = long;
    const volume = cutback ? 0.8 : 0.85 + (0.25 * i) / Math.max(build - 1, 1);
    const phase = i < build * 0.35 ? "Base" : i < build * 0.7 ? "Build" : "Peak";
    targets.push({ phase, long, volume, cutback });
  }
  if (taper === 2) targets.push({ phase: "Taper", long: Math.round(peakLong * 0.8), volume: 0.85 });
  if (taper >= 1) targets.push({ phase: "Taper", long: Math.round(peakLong * 0.55), volume: 0.65 });
  targets.push({ phase: "Race week", race: true });
  return targets;
}

// The run day furthest from the long run (for the hard session), e.g. Wed when the long run is Sun
function qualityDay(runDays, longDay) {
  const options = runDays.filter((d) => d !== longDay);
  const gap = (d) => Math.min(Math.abs(d - longDay), 7 - Math.abs(d - longDay));
  return options.reduce((best, d) => (gap(d) > gap(best) ? d : best), options[0]);
}

// ---------- Building the generated plan ----------

function generatedWeeks(settings) {
  const paces = paceRanges();
  const p = (key) => formatPaceRange(paces[key]);
  const firstMonday = mondayOn(settings.planStart);
  const raceMonday = mondayOn(settings.raceDate);
  const weeks = Math.max(1, Math.round((raceMonday - firstMonday) / (7 * 86400000)) + 1);
  const targets = weekTargets(weeks);

  const runDays = [...settings.runDays].sort((a, b) => a - b);
  const longDay = settings.longRunDay;
  const hardDay = qualityDay(runDays, longDay);
  const easyDays = runDays.filter((d) => d !== longDay && d !== hardDay);
  const stridesDay = easyDays.filter((d) => d < longDay).pop();
  const goal = formatTime(settings.goalTime);

  return targets.map((t, index) => {
    const monday = addDays(firstMonday, index * 7);
    const sessions = [];

    for (let day = 0; day < 7; day++) {
      const date = dateString(addDays(monday, day));
      let s;

      if (t.race) {
        const raceDay = dayIndex(settings.raceDate);
        const before = raceDay - day;
        if (day === raceDay) s = { type: "Race", km: 42.195, detail: `Goal ${goal} – start at ${p("marathon")}.`, pace: p("marathon") };
        else if (day > raceDay) s = { type: "Rest", km: 0, detail: "Recovery – rest and celebrate!" };
        else if (!runDays.includes(day)) s = { type: "Rest", km: 0, detail: "Rest and sleep well." };
        else if (before === 1) s = { type: "Easy", km: 3, detail: "Shake-out run + 4 short strides.", pace: p("easy") };
        else if (before <= 3) s = { type: "Easy", km: 5, detail: "Very easy.", pace: p("easy") };
        else s = { type: "Easy", km: 8, detail: "Include 3 km at marathon pace.", pace: p("easy") };
      } else if (!runDays.includes(day)) {
        s = { type: "Rest", km: 0, detail: "Rest or light stretching." };
      } else if (day === longDay) {
        const mpFinish = (t.phase === "Build" || t.phase === "Peak") && !t.cutback
          ? ` Last ${Math.round(t.long / 4)} km at marathon pace (${p("marathon")}).` : "";
        s = {
          type: "Long run", km: t.long, pace: p("long"),
          detail: (t.cutback ? "Recovery week – shorter and easy." : "Steady and easy.") + mpFinish,
        };
      } else if (day === hardDay) {
        s = index % 2 === 0
          ? { type: "Intervals", km: Math.round(11 * t.volume), pace: p("interval"),
              detail: `Warm up 2 km, ${Math.min(8, 5 + Math.floor(index / 3))} × 1 km with 2 min jog, cool down 2 km.` }
          : { type: "Tempo", km: Math.round(12 * t.volume), pace: p("tempo"),
              detail: `Easy start, then ${Math.max(4, Math.round(12 * t.volume) - 4)} km at tempo pace, easy finish.` };
      } else {
        // Fewer run days → each easy run is a little longer
        const km = Math.round((runDays.length <= 3 ? 11 : runDays.length === 4 ? 10 : 8) * t.volume);
        s = day === stridesDay
          ? { type: "Easy", km, pace: p("easy"), detail: "Finish with 4–6 × 100 m strides." }
          : { type: "Easy", km, pace: p("easy"), detail: "Conversational pace." };
      }

      s.title = sessionTitle(s.type, s.km);
      if (day === stridesDay && s.type === "Easy" && !t.race) s.title += " + strides";
      if (s.type === "Race") s.title = "Race day – marathon";
      sessions.push({ ...s, date, day: DAY_NAMES[day] });
    }

    return { number: index + 1, phase: t.phase, cutback: Boolean(t.cutback), sessions };
  });
}

// ---------- Your own imported plan ----------

function importedWeeks(customPlan) {
  const byDate = {};
  customPlan.sessions.forEach((s) => (byDate[s.date] = s));
  const dates = Object.keys(byDate).sort();
  const firstMonday = mondayOn(dates[0]);
  const weeks = Math.round((mondayOn(dates[dates.length - 1]) - firstMonday) / (7 * 86400000)) + 1;

  return Array.from({ length: weeks }, (_, index) => {
    const monday = addDays(firstMonday, index * 7);
    const sessions = DAY_NAMES.map((dayName, day) => {
      const date = dateString(addDays(monday, day));
      const s = byDate[date] || { type: "Rest", km: 0, pace: "", detail: "" };
      return {
        type: s.type, km: s.km, pace: s.pace || "", detail: s.detail || "",
        title: s.title || sessionTitle(s.type, s.km), date, day: dayName,
      };
    });
    return { number: index + 1, phase: customPlan.name || "My plan", cutback: false, sessions };
  });
}

// ---------- The plan used everywhere ----------

function buildPlan() {
  const settings = loadSettings();
  const usingOwn = settings.customPlan && settings.customPlan.sessions && settings.customPlan.sessions.length;
  const weeks = usingOwn ? importedWeeks(settings.customPlan) : generatedWeeks(settings);

  weeks.forEach((week) => {
    // Sessions you edited by hand replace the planned ones
    week.sessions = week.sessions.map((s) => {
      const edit = settings.overrides[s.date];
      if (!edit) return s;
      const type = edit.type || s.type;
      const km = type === "Rest" ? 0 : Number(edit.km ?? s.km) || 0;
      return {
        ...s, type, km,
        pace: type === "Rest" ? "" : edit.pace ?? s.pace,
        detail: edit.detail ?? "",
        title: sessionTitle(type, km),
        edited: true,
      };
    });
    week.start = week.sessions[0].date;
    week.end = week.sessions[6].date;
    week.plannedKm = week.sessions.reduce((sum, s) => sum + s.km, 0);
  });
  return weeks;
}

// ---------- Matching the plan with logged runs ----------

// Adds status to every session: rest, extra, done, short, missed, today, upcoming
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
      const km = (byDate[s.date] || []).reduce((sum, r) => sum + r.distance, 0);
      s.loggedKm = Math.round(km * 10) / 10;
      week.doneKm += km;

      if (s.type === "Rest") s.status = km > 0 ? "extra" : "rest";
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
