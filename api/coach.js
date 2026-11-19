// ===== Road to Osaka – AI Coach (coach page + coach's note on the home page) =====
// Sends a summary of your training to the serverless function in api/coach.js,
// which asks the AI and sends the answer back. The AI key never reaches the browser.

// Change this to your own Vercel address
const COACH_URL = "https://road-to-osaka.vercel.app/api/coach";
const REVIEW_KEY = "rto-coach-review";

let signedIn = false;

// ---------- Data sent to the coach ----------

function buildCoachContext() {
  const runs = loadRuns();
  const plan = applyRuns(buildPlan(), runs);
  const week = plan[currentWeekIndex(plan)];
  const daysLeft = Math.max(0, Math.ceil((RACE_DATE - new Date()) / 86400000));

  // Distance for each of the last 6 weeks (Monday to Sunday)
  const weeklyKm = [];
  const thisMonday = startOfWeek();
  for (let i = 5; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const end = addDays(start, 7);
    const km = runs
      .filter((r) => toLocalDate(r.date) >= start && toLocalDate(r.date) < end)
      .reduce((sum, r) => sum + r.distance, 0);
    weeklyKm.push({ week: dateString(start), km: Math.round(km * 10) / 10 });
  }

  return {
    goal: { time: formatTime(GOAL_TIME), marathonPace: formatPace(GOAL_PACE), raceDate: "2027-02-28", daysLeft },
    today: todayString(),
    planWeek: {
      number: week.number,
      phase: week.phase,
      plannedKm: Math.round(week.plannedKm),
      doneKm: week.doneKm,
      sessions: week.sessions.map((s) => ({
        day: s.day, date: s.date, title: s.title, pace: s.pace || "", status: s.status, loggedKm: s.loggedKm,
      })),
    },
    weeklyKm,
    recentRuns: sortRuns(runs).slice(0, 14).map((r) => ({
      date: r.date, type: r.type, km: r.distance, time: formatTime(r.seconds),
      pace: formatPace(paceOf(r)), effort: r.effort, notes: r.notes,
    })),
  };
}

async function askCoach(mode, question = "") {
  if (!window.getIdToken) throw new Error("Sign-in is not ready yet. Please wait a moment.");
  const token = await window.getIdToken();
  if (!token) throw new Error("Please sign in to use the AI coach.");

  let response;
  try {
    response = await fetch(COACH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ mode, question, context: buildCoachContext() }),
      signal: AbortSignal.timeout(60000), // never wait more than 1 minute
    });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" || err.name === "AbortError"
      ? "The coach took too long to answer. Please try again."
      : "Could not reach the coach. Check your internet connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The coach is not available right now.");
  return data.text;
}

// ---------- Showing the AI's text safely ----------
// Turns "- " lines into a list and **text** into bold, using textContent only (no innerHTML).

function addInline(parent, line) {
  line.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**")) parent.append(Object.assign(document.createElement("strong"), { textContent: part.slice(2, -2) }));
    else if (part) parent.append(part);
  });
}

function renderCoachText(box, text) {
  box.replaceChildren();
  let list = null;
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    const bullet = line.match(/^[-*•]\s+(.*)/);
    if (bullet) {
      if (!list) { list = document.createElement("ul"); box.append(list); }
      const li = document.createElement("li");
      addInline(li, bullet[1]);
      list.append(li);
    } else {
      list = null;
      const p = document.createElement("p");
      addInline(p, line.replace(/^#+\s*/, ""));
      box.append(p);
    }
  });
}

function loadSavedReview() {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_KEY));
  } catch {
    return null;
  }
}

function reviewDateLabel(saved) {
  return "Written " + new Date(saved.savedAt).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ---------- Coach page ----------

function setupCoachPage() {
  const reviewBox = document.getElementById("review-text");
  if (!reviewBox) return;

  const reviewBtn = document.getElementById("review-btn");
  const reviewMeta = document.getElementById("review-meta");
  const signinNote = document.getElementById("coach-signin");
  const form = document.getElementById("ask-form");
  const questionInput = document.getElementById("coach-question");
  const askBtn = document.getElementById("ask-btn");
  const chat = document.getElementById("chat");

  const saved = loadSavedReview();
  if (saved) {
    renderCoachText(reviewBox, saved.text);
    reviewMeta.textContent = reviewDateLabel(saved);
    reviewBtn.textContent = "Update review";
  }

  // Buttons always work; if you are not signed in, the coach tells you to sign in.
  reviewBtn.disabled = false;
  askBtn.disabled = false;
  signinNote.hidden = signedIn;
  window.addEventListener("auth-changed", (e) => {
    signedIn = e.detail.signedIn;
    signinNote.hidden = signedIn;
  });

  reviewBtn.addEventListener("click", async () => {
    reviewBtn.disabled = true;
    reviewBtn.textContent = "Thinking…";
    reviewBox.classList.add("loading");
    try {
      const text = await askCoach("review");
      const entry = { text, savedAt: Date.now() };
      localStorage.setItem(REVIEW_KEY, JSON.stringify(entry));
      renderCoachText(reviewBox, text);
      reviewMeta.textContent = reviewDateLabel(entry);
    } catch (err) {
      reviewMeta.textContent = err.message;
    } finally {
      reviewBox.classList.remove("loading");
      reviewBtn.textContent = "Update review";
      reviewBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = questionInput.value.trim();
    if (!question) return;

    const q = document.createElement("div");
    q.className = "chat-q";
    q.textContent = question;
    const a = document.createElement("div");
    a.className = "chat-a loading";
    a.textContent = "Thinking…";
    chat.append(q, a);
    questionInput.value = "";
    askBtn.disabled = true;

    try {
      renderCoachText(a, await askCoach("ask", question));
    } catch (err) {
      a.textContent = err.message;
      a.classList.add("chat-error");
    } finally {
      a.classList.remove("loading");
      askBtn.disabled = false;
      a.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  // Quick question buttons
  document.querySelectorAll("[data-question]").forEach((btn) => {
    btn.addEventListener("click", () => {
      questionInput.value = btn.dataset.question;
      questionInput.focus();
    });
  });
}

// ---------- Home page: today's session + latest coach note ----------

function setupHomeNote() {
  const box = document.getElementById("coach-note");
  if (!box) return;

  const render = () => {
    box.replaceChildren();
    const plan = applyRuns(buildPlan(), loadRuns());
    const today = todaysSession(plan);

    const todayBox = document.createElement("div");
    todayBox.className = "today-session";
    const label = document.createElement("p");
    label.className = "stat-label";
    label.textContent = "Today's plan";
    const title = document.createElement("p");
    title.className = "today-title";
    title.textContent = today ? today.title + (today.status === "done" ? " ✓" : "") : "No session planned";
    const detail = document.createElement("p");
    detail.className = "stat-label";
    detail.textContent = today && today.pace ? `${today.detail} · ${today.pace}` : today ? today.detail : "";
    todayBox.append(label, title, detail);
    box.append(todayBox);

    const saved = loadSavedReview();
    const note = document.createElement("div");
    note.className = "coach-note-text";
    if (saved) {
      renderCoachText(note, saved.text.split("\n").filter((l) => l.trim())[0] || saved.text);
      const more = document.createElement("a");
      more.href = "coach.html";
      more.className = "link";
      more.textContent = "Read the full review →";
      note.append(more);
    } else {
      const p = document.createElement("p");
      p.className = "stat-label";
      p.textContent = "No AI review yet. ";
      const link = document.createElement("a");
      link.href = "coach.html";
      link.className = "link";
      link.textContent = "Ask your coach";
      p.append(link);
      note.append(p);
    }
    box.append(note);
  };

  render();
  window.addEventListener("runs-changed", render);
}

setupCoachPage();
setupHomeNote();