// ===== Road to Osaka – Race Info page =====
// Course landmarks on a map (Leaflet + OpenStreetMap), a pacing plan from your goal,
// and a race-day checklist that remembers your ticks.

// Landmarks on or near the course – approximate positions, not the exact route
const LANDMARKS = [
  { name: "Start – Osaka Prefectural Government Building", note: "0 km", lat: 34.6862, lng: 135.5200, kind: "start" },
  { name: "Nakanoshima", note: "about 6 km – the 720 race finishes here", lat: 34.6935, lng: 135.5020 },
  { name: "Midosuji boulevard", note: "about 7–12 km", lat: 34.6780, lng: 135.5005 },
  { name: "Dotonbori (Glico sign)", note: "Namba – the course doubles back here", lat: 34.6688, lng: 135.5013 },
  { name: "Kyocera Dome Osaka", note: "southern / western part of the course", lat: 34.6694, lng: 135.4763 },
  { name: "Shitennoji Temple", note: "before the long Imazatosuji stretch", lat: 34.6536, lng: 135.5164 },
  { name: "Osaka Business Park", note: "final kilometres", lat: 34.6925, lng: 135.5340 },
  { name: "Finish – Osaka Castle Park", note: "42.195 km", lat: 34.6855, lng: 135.5290, kind: "finish" },
];

function setupMap() {
  const box = document.getElementById("course-map");
  if (!box) return;
  if (typeof L === "undefined") {
    box.innerHTML = '<div class="placeholder">The map could not be loaded. Check your internet connection.</div>';
    return;
  }

  const map = L.map(box, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const colors = { start: "#027a48", finish: "#e4572e" };
  const points = LANDMARKS.map((p) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: p.kind ? 10 : 7,
      color: "#fff",
      weight: 2,
      fillColor: colors[p.kind] || "#2b59c3",
      fillOpacity: 1,
    }).addTo(map);

    // Popup text built with textContent (no HTML from strings)
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = p.name;
    const note = document.createElement("div");
    note.textContent = p.note;
    popup.append(title, note);
    marker.bindPopup(popup);
    if (p.kind) marker.bindTooltip(p.kind === "start" ? "Start" : "Finish", { permanent: true, direction: "top", offset: [0, -8] });
    return [p.lat, p.lng];
  });

  map.fitBounds(points, { padding: [24, 24] });
}

// ---------- Pacing plan from your goal time ----------

const SPLITS = [
  { name: "5 km", km: 5, tip: "Start controlled – the first km will feel too easy." },
  { name: "10 km", km: 10, tip: "Settle into goal pace on Midosuji." },
  { name: "15 km", km: 15, tip: "Take a gel and drink at the aid stations." },
  { name: "20 km", km: 20, tip: "" },
  { name: "Half", km: 21.0975, tip: "Should feel comfortable here." },
  { name: "25 km", km: 25, tip: "Second gel." },
  { name: "30 km", km: 30, tip: "Climb ahead – keep effort steady, not pace." },
  { name: "35 km", km: 35, tip: "Third gel. Focus on form." },
  { name: "40 km", km: 40, tip: "Only 2.2 km to go – give what you have left." },
  { name: "Finish", km: 42.195, tip: "Osaka Castle!" },
];

function renderSplits() {
  const list = document.getElementById("split-list");
  if (!list) return;
  const goal = goalTime();
  const start = new Date(2000, 0, 1, 9, 15, 0);

  document.getElementById("split-note").textContent =
    `Even pace for your ${formatTime(goal)} goal: ${formatPace(goal / 42.195)}. Change your goal on the Plan page.`;

  list.replaceChildren();
  SPLITS.forEach((s) => {
    const elapsed = Math.round((goal * s.km) / 42.195);
    const clock = new Date(start.getTime() + elapsed * 1000);
    const tr = document.createElement("tr");
    [s.name, formatTime(elapsed), clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), s.tip]
      .forEach((text, i) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 3) td.className = "stat-label";
        if (i === 1) td.style.fontWeight = "700";
        tr.append(td);
      });
    list.append(tr);
  });
}

// ---------- Checklist (saved on this device) ----------

const CHECKLIST_KEY = "rto-race-checklist";

function setupChecklist() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || {};
  } catch (err) {
    saved = {};
  }
  document.querySelectorAll("#checklist input[data-item]").forEach((box) => {
    box.checked = Boolean(saved[box.dataset.item]);
    box.addEventListener("change", () => {
      saved[box.dataset.item] = box.checked;
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(saved));
    });
  });
}

setupMap();
renderSplits();
setupChecklist();
window.addEventListener("settings-changed", renderSplits);
