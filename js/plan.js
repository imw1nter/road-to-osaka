// ===== Road to Osaka – Training Plan page =====

const STATUS_LABELS = {
  done: "✓ Done",
  short: "Shorter",
  missed: "Missed",
  today: "Today",
  upcoming: "",
  rest: "",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortDay(dateStr) {
  return toLocalDate(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// One table of sessions (used for this week and for every week in the full plan)
function sessionTable(week) {
  const table = el("table", "plan-table");
  const head = el("tr");
  ["Day", "Session", "Pace", "Logged", ""].forEach((h) => head.append(el("th", "", h)));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");

  week.sessions.forEach((s) => {
    const tr = el("tr", "status-" + s.status);

    const day = el("td", "plan-day");
    day.append(el("strong", "", s.day), el("span", "stat-label", " " + shortDay(s.date)));

    const what = el("td");
    what.append(el("div", "plan-title", s.title));
    what.append(el("div", "plan-detail", s.detail));

    const logged = s.type === "Rest" ? "" : s.loggedKm ? s.loggedKm + " km" : "–";
    const status = el("td", "plan-status");
    if (STATUS_LABELS[s.status]) status.append(el("span", "status-badge " + s.status, STATUS_LABELS[s.status]));

    tr.append(day, what, el("td", "plan-pace", s.pace || ""), el("td", "", logged), status);
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
  document.getElementById("plan-progress").style.width = Math.min(100, (week.doneKm / week.plannedKm) * 100) + "%";
  document.getElementById("plan-done").textContent = past.length ? `${percent}%` : "–";
  document.getElementById("plan-done-label").textContent = past.length
    ? `${done} of ${past.length} sessions so far` : "no sessions due yet";
}

function renderPaces() {
  const list = document.getElementById("pace-guide");
  list.replaceChildren();
  [
    ["Easy", PACES.easy, "Most runs – you can hold a conversation"],
    ["Long run", PACES.long, "Steady, relaxed effort"],
    ["Marathon", PACES.marathon, "Goal race pace for 3:30:00"],
    ["Tempo", PACES.tempo, "Comfortably hard, about 1 hour race effort"],
    ["Intervals", PACES.interval, "Hard 1 km repeats"],
  ].forEach(([name, pace, note]) => {
    const tr = el("tr");
    tr.append(el("td", "", name), el("td", "plan-pace", formatPace(pace)), el("td", "stat-label", note));
    list.append(tr);
  });
}

function renderPlan() {
  const plan = applyRuns(buildPlan(), loadRuns());
  const index = currentWeekIndex(plan);
  const week = plan[index];

  renderSummary(plan, index);

  document.getElementById("this-week-title").textContent =
    `This week · ${shortDay(week.start)} – ${shortDay(week.end)}`;
  document.getElementById("this-week").replaceChildren(sessionTable(week));

  // Full plan: one collapsible block per week
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

renderPaces();
renderPlan();
window.addEventListener("runs-changed", renderPlan);
