// ===== Road to Osaka – shared script =====

// Osaka Marathon 2027: Sunday 28 February 2027, start 9:15 (JST)
const RACE_DATE = new Date("2027-02-28T09:15:00+09:00");

// Highlight the current page in the navigation
function setActiveNav() {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-list a").forEach((link) => {
    if (link.getAttribute("href") === current) link.classList.add("active");
  });
}

// Mobile menu toggle
function setupNavToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const list = document.querySelector(".nav-list");
  if (!toggle || !list) return;
  toggle.addEventListener("click", () => {
    const open = list.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
}

// Countdown to race day (only runs on pages that have #countdown)
function startCountdown() {
  const box = document.getElementById("countdown");
  if (!box) return;

  const update = () => {
    const diff = RACE_DATE - new Date();
    if (diff <= 0) {
      box.innerHTML = "<div><strong>🏁</strong><small>Race day!</small></div>";
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff / 3600000) % 24);
    const mins = Math.floor((diff / 60000) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    box.querySelector("[data-days]").textContent = days;
    box.querySelector("[data-hours]").textContent = String(hours).padStart(2, "0");
    box.querySelector("[data-mins]").textContent = String(mins).padStart(2, "0");
    box.querySelector("[data-secs]").textContent = String(secs).padStart(2, "0");
  };

  update();
  setInterval(update, 1000);
}

// Footer year
function setYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
  setupNavToggle();
  startCountdown();
  setYear();
});
