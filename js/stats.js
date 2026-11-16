// ===== Road to Osaka – Stats page (charts with Chart.js) =====

const GOAL_TIME = 3 * 3600 + 30 * 60;             // marathon goal: 3:30:00
const GOAL_PACE = GOAL_TIME / 42.195;              // ≈ 4:59 /km

const COLORS = {
  primary: "#e4572e",
  primaryLight: "rgba(228, 87, 46, 0.15)",
  accent: "#2b59c3",
  muted: "#667085",
  grid: "#eef0f4",
};

// ---------- Helpers ----------

// Monday of the week that contains this date
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function shortDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Pace axis label: 300 -> "5:00"
function paceLabel(sec) {
  return formatPace(sec).replace(" /km", "");
}

let charts = []; // current Chart objects, so they can be destroyed and redrawn

// Shared Chart.js look
function setChartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = COLORS.muted;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.maintainAspectRatio = false;
}

// ---------- Totals ----------

function renderTotals(runs) {
  const s = summarize(runs);
  document.getElementById("total-distance").textContent = s.distance.toFixed(1) + " km";
  document.getElementById("total-runs").textContent = s.count;
  document.getElementById("total-time").textContent = formatTime(s.seconds);
  document.getElementById("total-pace").textContent = formatPace(s.pace);
}

// ---------- Chart 1: weekly mileage (last 12 weeks) ----------

function weeklyMileage(runs, weeks = 12) {
  const thisMonday = mondayOf(new Date());
  const labels = [];
  const totals = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const km = runs
      .filter((r) => {
        const d = toLocalDate(r.date);
        return d >= start && d < end;
      })
      .reduce((sum, r) => sum + r.distance, 0);

    labels.push(shortDate(start));
    totals.push(Math.round(km * 10) / 10);
  }
  return { labels, totals };
}

function drawWeeklyChart(runs) {
  const { labels, totals } = weeklyMileage(runs);
  charts.push(new Chart(document.getElementById("weekly-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Distance",
        data: totals,
        backgroundColor: totals.map((_, i) => (i === totals.length - 1 ? COLORS.primary : "rgba(228, 87, 46, 0.45)")),
        borderRadius: 6,
      }],
    },
    options: {
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { callback: (v) => v + " km" } },
      },
      plugins: {
        tooltip: { callbacks: { title: (items) => "Week of " + items[0].label, label: (item) => item.raw + " km" } },
      },
    },
  }));
}

// ---------- Chart 2: pace trend (last 20 runs) ----------

function drawPaceChart(runs) {
  const recent = sortRuns(runs).slice(0, 20).reverse(); // oldest -> newest
  const labels = recent.map((r) => shortDate(toLocalDate(r.date)));
  const paces = recent.map((r) => Math.round(paceOf(r)));

  charts.push(new Chart(document.getElementById("pace-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pace",
          data: paces,
          borderColor: COLORS.primary,
          backgroundColor: COLORS.primaryLight,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: COLORS.primary,
        },
        {
          label: "Goal pace",
          data: paces.map(() => Math.round(GOAL_PACE)),
          borderColor: COLORS.accent,
          borderDash: [6, 6],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      scales: {
        x: { grid: { display: false } },
        // Reverse so that faster (smaller number) is higher on the chart
        y: { reverse: true, grid: { color: COLORS.grid }, ticks: { callback: (v) => paceLabel(v) } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              if (item.datasetIndex === 1) return "Goal: " + formatPace(item.raw);
              const run = recent[item.dataIndex];
              return `${formatPace(item.raw)} · ${run.distance} km ${run.type.toLowerCase()}`;
            },
          },
        },
      },
    },
  }));
}

// ---------- Chart 3: long runs ----------

function drawLongChart(runs) {
  const longRuns = runs
    .filter((r) => r.distance >= 15 || r.type === "Long run")
    .sort((a, b) => a.date.localeCompare(b.date));

  const canvas = document.getElementById("long-chart");
  const box = canvas.parentElement;
  let empty = box.querySelector(".placeholder");

  if (longRuns.length === 0) {
    canvas.hidden = true;
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "placeholder";
      empty.textContent = "No long runs yet. Runs of 15 km or more will appear here.";
      box.append(empty);
    }
    return;
  }
  canvas.hidden = false;
  if (empty) empty.remove();

  charts.push(new Chart(canvas, {
    type: "line",
    data: {
      labels: longRuns.map((r) => shortDate(toLocalDate(r.date))),
      datasets: [{
        label: "Long run",
        data: longRuns.map((r) => r.distance),
        borderColor: COLORS.accent,
        backgroundColor: "rgba(43, 89, 195, 0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: COLORS.accent,
      }],
    },
    options: {
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          suggestedMax: 42.2,
          grid: { color: COLORS.grid },
          ticks: { callback: (v) => v + " km" },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              const run = longRuns[item.dataIndex];
              return `${run.distance} km in ${formatTime(run.seconds)} (${formatPace(paceOf(run))})`;
            },
          },
        },
      },
    },
  }));
}

// ---------- Personal bests ----------

const PB_DISTANCES = [
  { name: "5K", km: 5 },
  { name: "10K", km: 10 },
  { name: "Half marathon", km: 21.0975 },
  { name: "Marathon", km: 42.195 },
];

function renderPersonalBests(runs) {
  const list = document.getElementById("pb-list");
  list.replaceChildren();

  PB_DISTANCES.forEach((pb) => {
    // Only runs at least this long (small tolerance for GPS: 1%)
    const eligible = runs.filter((r) => r.distance >= pb.km * 0.99);
    const best = eligible.reduce((a, r) => (!a || paceOf(r) < paceOf(a) ? r : a), null);

    const tr = document.createElement("tr");
    const cells = best
      ? [pb.name, formatTime(paceOf(best) * pb.km), formatPace(paceOf(best)), formatDate(best.date)]
      : [pb.name, "--", "--", "No run this long yet"];

    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (i === 1 && best) td.style.fontWeight = "700";
      if (i === 3) td.className = "stat-label";
      tr.append(td);
    });
    list.append(tr);
  });
}

// ---------- Start ----------

function renderStats() {
  const runs = loadRuns();
  renderTotals(runs);
  renderPersonalBests(runs);
  document.getElementById("stats-empty").hidden = runs.length > 0;

  if (typeof Chart === "undefined") return;

  charts.forEach((c) => c.destroy());
  charts = [];
  drawWeeklyChart(runs);
  drawPaceChart(runs);
  drawLongChart(runs);
}

function initStats() {
  if (typeof Chart === "undefined") {
    document.querySelectorAll(".chart-box").forEach((box) => {
      box.innerHTML = '<div class="placeholder">Charts could not be loaded. Check your internet connection.</div>';
    });
  } else {
    setChartDefaults();
  }
  renderStats();
}

document.addEventListener("DOMContentLoaded", initStats);
// Re-draw when runs change from the cloud (sign-in, another device)
window.addEventListener("runs-changed", renderStats);