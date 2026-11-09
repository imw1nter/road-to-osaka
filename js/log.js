// ===== Road to Osaka – Run Log page =====

const form = document.getElementById("run-form");
const fields = {
  date: document.getElementById("run-date"),
  type: document.getElementById("run-type"),
  distance: document.getElementById("run-distance"),
  time: document.getElementById("run-time"),
  effort: document.getElementById("run-effort"),
  pace: document.getElementById("run-pace"),
  notes: document.getElementById("run-notes"),
};
const effortValue = document.getElementById("effort-value");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const filterType = document.getElementById("filter-type");
const runList = document.getElementById("run-list");
const runSummary = document.getElementById("run-summary");
const toast = document.getElementById("toast");

let editingId = null; // id of the run being edited, or null when adding

// ---------- Form ----------

function resetForm() {
  form.reset();
  fields.date.value = todayString();
  fields.date.max = todayString();
  effortValue.textContent = fields.effort.value;
  fields.pace.value = "--:-- /km";
  editingId = null;
  formTitle.textContent = "Add a run";
  submitBtn.textContent = "Save run";
  cancelBtn.hidden = true;
  hideError();
  renderRuns();
}

// Live pace while typing
function updatePace() {
  const distance = parseFloat(fields.distance.value);
  const seconds = parseTime(fields.time.value);
  fields.pace.value = distance > 0 && seconds ? formatPace(seconds / distance) : "--:-- /km";
}

function showError(message, field) {
  formError.textContent = message;
  formError.hidden = false;
  if (field) {
    field.classList.add("invalid");
    field.focus();
  }
}

function hideError() {
  formError.hidden = true;
  Object.values(fields).forEach((f) => f.classList.remove("invalid"));
}

// Returns a run object, or null if something is wrong
function readForm() {
  hideError();
  const date = fields.date.value;
  const distance = parseFloat(fields.distance.value);
  const seconds = parseTime(fields.time.value);

  if (!date) return showError("Please choose a date.", fields.date), null;
  if (date > todayString()) return showError("The date can't be in the future.", fields.date), null;
  if (!(distance > 0) || distance > 200) return showError("Enter a distance between 0.1 and 200 km.", fields.distance), null;
  if (!seconds) return showError("Enter the time as h:mm:ss or mm:ss, e.g. 55:00 or 1:45:30.", fields.time), null;

  const pace = seconds / distance;
  if (pace < 120) return showError("That pace is faster than 2:00 /km. Please check the distance and time.", fields.time), null;

  return {
    date,
    type: fields.type.value,
    distance: Math.round(distance * 100) / 100,
    seconds,
    effort: Number(fields.effort.value),
    notes: fields.notes.value.trim(),
  };
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const run = readForm();
  if (!run) return;

  if (editingId) {
    updateRun(editingId, run);
    showToast("Run updated");
  } else {
    addRun(run);
    showToast(`Saved ${run.distance} km ${run.type.toLowerCase()} run`);
  }
  resetForm();
});

cancelBtn.addEventListener("click", resetForm);
fields.distance.addEventListener("input", updatePace);
fields.time.addEventListener("input", updatePace);
fields.effort.addEventListener("input", () => (effortValue.textContent = fields.effort.value));

// ---------- Edit / delete ----------

function startEdit(run) {
  editingId = run.id;
  fields.date.value = run.date;
  fields.type.value = run.type;
  fields.distance.value = run.distance;
  fields.time.value = formatTime(run.seconds);
  fields.effort.value = run.effort;
  effortValue.textContent = run.effort;
  fields.notes.value = run.notes;
  updatePace();

  formTitle.textContent = "Edit run";
  submitBtn.textContent = "Update run";
  cancelBtn.hidden = false;
  hideError();
  renderRuns();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function removeRun(run) {
  const ok = confirm(`Delete the ${run.distance} km run on ${formatDate(run.date)}?`);
  if (!ok) return;
  deleteRun(run.id);
  if (editingId === run.id) resetForm();
  else renderRuns();
  showToast("Run deleted");
}

// ---------- List ----------

// Small helper to build a table cell safely (textContent, never innerHTML for user input)
function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderRuns() {
  const all = sortRuns(loadRuns());
  const filter = filterType.value;
  const runs = filter === "All" ? all : all.filter((r) => r.type === filter);

  runList.replaceChildren();

  if (runs.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = cell(all.length === 0 ? "No runs yet. Add your first run above." : `No ${filter.toLowerCase()} runs yet.`);
    td.colSpan = 8;
    tr.append(td);
    runList.append(tr);
  }

  runs.forEach((run) => {
    const tr = document.createElement("tr");
    if (run.id === editingId) tr.className = "editing";

    const typeCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge badge-" + run.type.toLowerCase().replace(/\s+/g, "-");
    badge.textContent = run.type;
    typeCell.append(badge);

    const notesCell = cell(run.notes || "–", "notes");
    if (run.notes) notesCell.title = run.notes;

    const actions = document.createElement("td");
    actions.className = "actions";
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEdit(run));
    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeRun(run));
    actions.append(editBtn, " ", delBtn);

    tr.append(
      cell(formatDate(run.date)),
      typeCell,
      cell(run.distance.toFixed(2) + " km"),
      cell(formatTime(run.seconds)),
      cell(formatPace(paceOf(run))),
      cell(run.effort + "/10"),
      notesCell,
      actions
    );
    runList.append(tr);
  });

  const s = summarize(runs);
  runSummary.textContent = s.count
    ? `${s.count} run${s.count > 1 ? "s" : ""} · ${s.distance.toFixed(1)} km · ${formatTime(s.seconds)} · average ${formatPace(s.pace)}`
    : "";
}

filterType.addEventListener("change", renderRuns);

// ---------- Toast message ----------

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---------- Start ----------
resetForm();