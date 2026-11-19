// ===== Road to Osaka – Training Plan page =====
// Shows the plan, and lets you customize it: goal, paces, weekly structure,
// editing single sessions, and importing your own plan from a CSV file.

const STATUS_LABELS = {
  done: "✓ Done",
  short: "Shorter",
  missed: "Missed",
  today: "Today",
  extra: "Extra run",
  upcoming: "",
  rest: "",
};

const PACE_INFO = [
  ["easy", "Easy", "Most runs – you can hold a conversation"],
  ["long", "Long run", "Steady, relaxed effort"],
  ["marathon", "Marathon", "Goal race pace"],
  ["tempo", "Tempo", "Comfortably hard, about 1 hour race effort"],
  ["interval", "Intervals", "Hard 1 km repeats"],
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortDay(dateStr) {
  return toLocalDate(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------- Showing the plan ----------

function sessionTable(week) {
  const table = el("table", "plan-table");
  const head = el("tr");
  ["Day", "Session", "Pace", "Logged", "", ""].forEach((h) => head.append(el("th", "", h)));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");

  week.sessions.forEach((s) => {
    const tr = el("tr", "status-" + s.status);

    const day = el("td", "plan-day");
    day.append(el("strong", "", s.day), el("span", "stat-label", " " + shortDay(s.date)));

    const what = el("td");
    const title = el("div", "plan-title", s.title);
    if (s.edited) title.append(el("span", "edited-tag", "edited"));
    what.append(title);
    if (s.detail) what.append(el("div", "plan-detail", s.detail));

    const logged = s.loggedKm ? s.loggedKm + " km" : s.type === "Rest" ? "" : "–";
    const status = el("td", "plan-status");
    if (STATUS_LABELS[s.status]) status.append(el("span", "status-badge " + s.status, STATUS_LABELS[s.status]));

    const actions = el("td", "plan-actions");
    const edit = el("button", "icon-btn", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => openEditDialog(s));
    actions.append(edit);

    tr.append(day, what, el("td", "plan-pace", s.pace || ""), el("td", "", logged), status, actions);
    tbody.append(tr);
  });

  table.append(thead, tbody);
  const wrap = el("div", "table-wrap");
  wrap.append(table);
  return wrap;
}

function renderSummary(plan, index) {
  const week = plan[index];
  const past = plan.flatMap((w) => w.sessions).filter((s) => s.type !== "Rest" && s.date < todayString());
  const done = past.filter((s) => s.status === "done").length;
  const percent = past.length ? Math.round((done / past.length) * 100) : 0;

  document.getElementById("plan-week").textContent = `Week ${week.number} of ${plan.length}`;
  document.getElementById("plan-phase").textContent = week.phase + (week.cutback ? " · recovery week" : "");
  document.getElementById("plan-km").textContent = `${week.doneKm} / ${Math.round(week.plannedKm)} km`;
  document.getElementById("plan-progress").style.width =
    week.plannedKm ? Math.min(100, (week.doneKm / week.plannedKm) * 100) + "%" : "0%";
  document.getElementById("plan-done").textContent = past.length ? `${percent}%` : "–";
  document.getElementById("plan-done-label").textContent = past.length
    ? `${done} of ${past.length} sessions so far` : "no sessions due yet";
}

function renderPaces() {
  const ranges = paceRanges();
  const own = loadSettings().paces;
  const list = document.getElementById("pace-guide");
  list.replaceChildren();
  PACE_INFO.forEach(([key, name, note]) => {
    const tr = el("tr");
    const pace = el("td", "plan-pace", formatPaceRange(ranges[key]));
    if (own[key]) pace.append(el("span", "edited-tag", "yours"));
    tr.append(el("td", "", name), pace, el("td", "stat-label", note));
    list.append(tr);
  });
  document.getElementById("pace-note").textContent = `From your ${formatTime(goalTime())} marathon goal, unless you set your own.`;
}

function renderPlan() {
  const settings = loadSettings();
  const plan = applyRuns(buildPlan(), loadRuns());
  const index = currentWeekIndex(plan);
  const week = plan[index];

  document.getElementById("plan-subtitle").textContent = settings.customPlan
    ? `Your own plan “${settings.customPlan.name}” · ${plan.length} weeks. Sessions are ticked off automatically when you log a run that day.`
    : `${plan.length} weeks to the Osaka Marathon on ${formatRaceDate()} · goal ${formatTime(settings.goalTime)}. Sessions are ticked off automatically when you log a run that day.`;

  renderSummary(plan, index);
  renderPaces();

  document.getElementById("this-week-title").textContent =
    `This week · ${shortDay(week.start)} – ${shortDay(week.end)}`;
  document.getElementById("this-week").replaceChildren(sessionTable(week));

  const all = document.getElementById("all-weeks");
  const openWeeks = new Set([...all.querySelectorAll("details[open]")].map((d) => d.dataset.week));
  all.replaceChildren();
  plan.forEach((w, i) => {
    const details = el("details", "plan-week" + (i === index ? " current" : ""));
    details.dataset.week = w.number;
    if (openWeeks.has(String(w.number))) details.open = true;
    const summary = el("summary");
    summary.append(
      el("strong", "", `Week ${w.number}`),
      el("span", "stat-label", ` ${shortDay(w.start)} – ${shortDay(w.end)} · ${w.phase}${w.cutback ? " (recovery)" : ""}`),
      el("span", "plan-week-km", `${w.doneKm} / ${Math.round(w.plannedKm)} km`)
    );
    details.append(summary, sessionTable(w));
    all.append(details);
  });
}

// ---------- Dialog helpers ----------

function showError(id, message) {
  const box = document.getElementById(id);
  box.textContent = message || "";
  box.hidden = !message;
}

document.querySelectorAll("dialog [data-close]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});

// ---------- Edit one session ----------

const editDialog = document.getElementById("edit-dialog");
const editType = document.getElementById("edit-type");
let editingDate = null;

SESSION_TYPES.forEach((t) => editType.append(new Option(t, t)));

function openEditDialog(session) {
  editingDate = session.date;
  document.getElementById("edit-title").textContent = `Edit ${session.day} ${shortDay(session.date)}`;
  editType.value = session.type;
  document.getElementById("edit-km").value = session.km || "";
  document.getElementById("edit-pace").value = session.pace ? session.pace.replace(" /km", "") : "";
  document.getElementById("edit-detail").value = session.detail || "";
  document.getElementById("edit-reset").hidden = !session.edited;
  showError("edit-error", "");
  editDialog.showModal();
}

editType.addEventListener("change", () => {
  const rest = editType.value === "Rest";
  document.getElementById("edit-km").disabled = rest;
  document.getElementById("edit-pace").disabled = rest;
  if (editType.value === "Race") document.getElementById("edit-km").value = 42.195;
});

document.getElementById("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = editType.value;
  const km = type === "Rest" ? 0 : parseFloat(document.getElementById("edit-km").value);
  const paceText = document.getElementById("edit-pace").value;
  const pace = parsePaceRange(paceText);

  if (type !== "Rest" && !(km > 0 && km <= 100)) return showError("edit-error", "Enter a distance between 0.1 and 100 km.");
  if (pace === undefined) return showError("edit-error", "Write the pace like 6:00-6:40 or 5:30.");

  const settings = loadSettings();
  settings.overrides = {
    ...settings.overrides,
    [editingDate]: {
      type,
      km: Math.round(km * 100) / 100,
      pace: type === "Rest" || !pace ? "" : formatPaceRange(pace),
      detail: document.getElementById("edit-detail").value.trim().slice(0, 200),
    },
  };
  saveSettings(settings);
  editDialog.close();
});

document.getElementById("edit-reset").addEventListener("click", () => {
  const settings = loadSettings();
  const overrides = { ...settings.overrides };
  delete overrides[editingDate];
  settings.overrides = overrides;
  saveSettings(settings);
  editDialog.close();
});

// ---------- Customize plan ----------

const settingsDialog = document.getElementById("settings-dialog");
const runDaysBox = document.getElementById("run-days");
const longSelect = document.getElementById("set-long");
let pendingImport = undefined; // undefined = no change, null = remove own plan, object = new plan

// Day checkboxes
DAY_NAMES.forEach((name, i) => {
  const label = el("label", "day-chip");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = i;
  label.append(box, name);
  runDaysBox.append(label);
});

function checkedDays() {
  return [...runDaysBox.querySelectorAll("input:checked")].map((b) => Number(b.value));
}

function refreshLongSelect(selected) {
  const days = checkedDays();
  longSelect.replaceChildren(...days.map((d) => new Option(DAY_NAMES[d], d)));
  if (days.includes(selected)) longSelect.value = selected;
  else if (days.length) longSelect.value = days[days.length - 1];
}
runDaysBox.addEventListener("change", () => refreshLongSelect(Number(longSelect.value)));

// Pace boxes
const paceInputs = document.getElementById("pace-inputs");
PACE_INFO.forEach(([key, name]) => {
  const wrap = el("div");
  const label = el("label", "", name);
  label.htmlFor = "pace-" + key;
  const input = document.createElement("input");
  input.id = "pace-" + key;
  input.type = "text";
  input.dataset.key = key;
  wrap.append(label, input);
  paceInputs.append(wrap);
});

function ownPlanStatus(settings) {
  const status = document.getElementById("own-plan-status");
  const plan = pendingImport === undefined ? settings.customPlan : pendingImport;
  status.textContent = plan
    ? `Using your own plan “${plan.name}” (${plan.sessions.length} sessions). The goal and weekly structure above are not used for it.`
    : "Using the plan generated from your goal. Import a CSV file to use your own plan instead.";
  document.getElementById("use-generated").hidden = !plan;
}

function fillSettingsForm() {
  const s = loadSettings();
  const auto = autoPaceRanges(s.goalTime); // paces from the goal only – shown as grey hints

  document.getElementById("set-goal").value = formatTime(s.goalTime);
  document.getElementById("set-race").value = s.raceDate;
  document.getElementById("set-start").value = s.planStart;
  paceInputs.querySelectorAll("input").forEach((input) => {
    const key = input.dataset.key;
    input.placeholder = formatPaceRange(auto[key]).replace(" /km", "");
    input.value = s.paces[key] ? formatPaceRange(s.paces[key]).replace(" /km", "") : "";
  });
  runDaysBox.querySelectorAll("input").forEach((b) => (b.checked = s.runDays.includes(Number(b.value))));
  refreshLongSelect(s.longRunDay);
  document.getElementById("edit-count").textContent =
    `${Object.keys(s.overrides).length} session(s) edited by hand.`;
  document.getElementById("csv-result").hidden = true;
  pendingImport = undefined;
  ownPlanStatus(s);
  showError("settings-error", "");
}

document.getElementById("customize-btn").addEventListener("click", () => {
  fillSettingsForm();
  settingsDialog.showModal();
});

// Update the grey hints when the goal changes
document.getElementById("set-goal").addEventListener("input", (e) => {
  const goal = parseGoalTime(e.target.value);
  if (!goal) return;
  const auto = autoPaceRanges(goal);
  paceInputs.querySelectorAll("input").forEach((input) => {
    input.placeholder = formatPaceRange(auto[input.dataset.key]).replace(" /km", "");
  });
});

document.getElementById("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const s = loadSettings();

  const goal = parseGoalTime(document.getElementById("set-goal").value);
  if (!goal) return showError("settings-error", "Goal time must be between 2:00:00 and 8:00:00, written like 3:30:00.");

  const raceDate = document.getElementById("set-race").value;
  const startInput = document.getElementById("set-start").value;
  if (!raceDate || !startInput) return showError("settings-error", "Choose a race date and a start date.");
  const planStart = dateString(mondayOn(startInput));
  const weeks = Math.round((mondayOn(raceDate) - mondayOn(planStart)) / (7 * 86400000)) + 1;
  if (weeks < 4 || weeks > 30) return showError("settings-error", `The plan must be 4–30 weeks long (now ${weeks}). Check the dates.`);

  const paces = {};
  for (const input of paceInputs.querySelectorAll("input")) {
    const range = parsePaceRange(input.value);
    if (range === undefined) {
      input.focus();
      return showError("settings-error", "Write paces like 6:00-6:40 or 5:30, or leave the box empty.");
    }
    paces[input.dataset.key] = range;
  }

  const runDays = checkedDays();
  if (runDays.length < 3 || runDays.length > 6) return showError("settings-error", "Choose 3 to 6 running days.");

  s.goalTime = goal;
  s.raceDate = raceDate;
  s.planStart = planStart;
  s.paces = paces;
  s.runDays = runDays;
  s.longRunDay = Number(longSelect.value);
  if (pendingImport !== undefined) s.customPlan = pendingImport;

  saveSettings(s);
  settingsDialog.close();
});

document.getElementById("reset-settings").addEventListener("click", () => {
  if (!confirm("Reset goal, paces, weekly structure, edits and your imported plan to the defaults?")) return;
  saveSettings({ ...DEFAULT_SETTINGS, paces: { ...DEFAULT_SETTINGS.paces }, overrides: {} });
  settingsDialog.close();
});

document.getElementById("reset-edits").addEventListener("click", () => {
  if (!confirm("Undo every session you edited by hand?")) return;
  updateSettings({ overrides: {} });
  document.getElementById("edit-count").textContent = "0 session(s) edited by hand.";
});

document.getElementById("use-generated").addEventListener("click", () => {
  pendingImport = null;
  ownPlanStatus(loadSettings());
  document.getElementById("csv-result").hidden = true;
});

// ---------- CSV import ----------

const CSV_TEMPLATE = [
  "date,type,km,pace,notes",
  "2026-11-23,Rest,0,,",
  "2026-11-24,Easy,8,6:00-6:40,Conversational pace",
  "2026-11-25,Intervals,10,4:15-4:30,6 x 1 km with 2 min jog",
  "2026-11-26,Easy,7,6:00-6:40,",
  "2026-11-28,Easy,6,6:00-6:40,Strides at the end",
  "2026-11-29,Long run,20,5:35-6:10,Last 5 km at marathon pace",
].join("\n");

document.getElementById("csv-template").addEventListener("click", () => {
  const blob = new Blob([CSV_TEMPLATE + "\n"], { type: "text/csv" });
  const link = el("a");
  link.href = URL.createObjectURL(blob);
  link.download = "road-to-osaka-plan-template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// Splits one CSV line, allowing "quoted, values"
function splitCsvLine(line, sep) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === sep && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

// Returns { sessions, errors }
function parsePlanCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors = [];
  if (!lines.length) return { sessions: [], errors: ["The file is empty."] };

  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (name) => header.indexOf(name);
  if (col("date") === -1 || col("type") === -1) {
    return { sessions: [], errors: ['The first line must be the column names: date,type,km,pace,notes'] };
  }

  const byDate = {};
  lines.slice(1).forEach((line, i) => {
    const row = splitCsvLine(line, sep);
    const n = i + 2; // line number in the file
    const date = row[col("date")] || "";
    const typeText = (row[col("type")] || "").toLowerCase();
    const type = SESSION_TYPES.find((t) => t.toLowerCase() === typeText || (t === "Long run" && typeText === "long"));
    const km = col("km") === -1 ? 0 : parseFloat((row[col("km")] || "0").replace(",", "."));
    const paceText = col("pace") === -1 ? "" : row[col("pace")] || "";
    const pace = parsePaceRange(paceText);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(toLocalDate(date))) return errors.push(`Line ${n}: date must look like 2026-11-24.`);
    if (!type) return errors.push(`Line ${n}: type must be one of ${SESSION_TYPES.join(", ")}.`);
    if (type !== "Rest" && !(km > 0 && km <= 100)) return errors.push(`Line ${n}: km must be between 0.1 and 100.`);
    if (pace === undefined) return errors.push(`Line ${n}: pace must look like 6:00-6:40 or 5:30.`);

    byDate[date] = {
      date, type,
      km: type === "Rest" ? 0 : Math.round(km * 100) / 100,
      pace: type === "Rest" || !pace ? "" : formatPaceRange(pace),
      detail: (col("notes") === -1 ? "" : row[col("notes")] || "").slice(0, 200),
    };
  });

  const sessions = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length > 400) errors.push("A plan can have at most 400 sessions.");
  if (sessions.length) {
    const weeks = Math.round((mondayOn(sessions[sessions.length - 1].date) - mondayOn(sessions[0].date)) / (7 * 86400000)) + 1;
    if (weeks > 52) errors.push("The plan can cover at most 52 weeks.");
  }
  return { sessions, errors };
}

document.getElementById("csv-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const box = document.getElementById("csv-result");
  box.hidden = false;
  box.replaceChildren();

  if (file.size > 200 * 1024) {
    box.append(el("p", "form-error", "That file is too big (max 200 KB)."));
    return;
  }
  const { sessions, errors } = parsePlanCsv(await file.text());

  if (errors.length || !sessions.length) {
    box.append(el("p", "form-error", errors.length ? `Could not import – ${errors.length} problem(s):` : "No sessions found."));
    const list = el("ul");
    errors.slice(0, 6).forEach((e) => list.append(el("li", "", e)));
    if (errors.length > 6) list.append(el("li", "", `…and ${errors.length - 6} more`));
    box.append(list);
    return;
  }

  const runs = sessions.filter((s) => s.type !== "Rest");
  const km = runs.reduce((sum, s) => sum + s.km, 0);
  pendingImport = {
    name: file.name.replace(/\.csv$/i, "").slice(0, 40),
    importedAt: Date.now(),
    sessions,
  };
  box.append(el("p", "import-ok",
    `✓ ${sessions.length} sessions from ${shortDay(sessions[0].date)} to ${shortDay(sessions[sessions.length - 1].date)} · ${runs.length} runs · ${Math.round(km)} km. Click Save to use this plan.`));
  ownPlanStatus(loadSettings());
});

// ---------- Start ----------

renderPlan();
window.addEventListener("runs-changed", renderPlan);
window.addEventListener("settings-changed", renderPlan);
