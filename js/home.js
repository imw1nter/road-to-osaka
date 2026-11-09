// ===== Road to Osaka – Home page stats =====

function renderHomeStats() {
  const runs = loadRuns();

  // This week (Monday to today)
  const weekStart = startOfWeek();
  const thisWeek = runs.filter((r) => toLocalDate(r.date) >= weekStart);
  const week = summarize(thisWeek);
  document.getElementById("week-distance").textContent = week.distance.toFixed(1) + " km";
  document.getElementById("week-count").textContent = `${week.count} run${week.count === 1 ? "" : "s"}`;

  // Average pace over the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const recent = summarize(runs.filter((r) => toLocalDate(r.date) >= sevenDaysAgo));
  document.getElementById("avg-pace").textContent = formatPace(recent.pace);

  // Longest run so far
  if (runs.length) {
    const longest = runs.reduce((best, r) => (r.distance > best.distance ? r : best));
    document.getElementById("longest-run").textContent = longest.distance.toFixed(1) + " km";
    document.getElementById("longest-date").textContent = formatDate(longest.date);
  }
}

document.addEventListener("DOMContentLoaded", renderHomeStats);