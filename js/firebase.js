// ===== Road to Osaka – Firebase login and cloud sync =====
// Google sign-in with Firebase Authentication, runs saved in Cloud Firestore at
//   users/{uid}/runs/{runId}
// localStorage is the local copy that every page reads. This file keeps it in sync
// with the cloud and remembers changes that have not reached the server yet
// ("pending"), so nothing is lost if the page is reloaded or the network drops.

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, collection, doc, setDoc, deleteDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const OWNER_KEY = "rto-owner";     // uid of the account the local runs belong to
const PENDING_KEY = "rto-pending"; // runs saved/deleted locally but not yet confirmed by the server
const authBtn = document.getElementById("auth-btn");

// ---------- Small helpers ----------

function notify(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function runsChanged() {
  window.dispatchEvent(new Event("runs-changed"));
}

function renderAuthButton(user) {
  authBtn.hidden = false;
  authBtn.replaceChildren();
  authBtn.classList.toggle("signed-in", Boolean(user));

  if (!user) {
    authBtn.textContent = "Sign in";
    authBtn.title = "Sign in with Google to save your runs in the cloud";
    return;
  }
  if (user.photoURL) {
    const img = document.createElement("img");
    img.src = user.photoURL;
    img.alt = "";
    img.width = 24;
    img.height = 24;
    img.referrerPolicy = "no-referrer";
    authBtn.append(img);
  }
  const firstName = (user.displayName || user.email || "Account").split(" ")[0];
  authBtn.append(firstName);
  authBtn.title = `Signed in as ${user.email} – click to sign out`;
}

// ---------- Pending changes (kept in localStorage, survive reloads) ----------

function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY));
    if (p && p.saves && p.deletes) return p;
  } catch (err) {
    /* broken data – start fresh */
  }
  return { saves: {}, deletes: {} };
}

function setPending(kind, id, isPending) {
  const p = readPending();
  if (isPending) p[kind][id] = true;
  else delete p[kind][id];
  localStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

function pendingCount() {
  const p = readPending();
  return Object.keys(p.saves).length + Object.keys(p.deletes).length;
}

// ---------- Start ----------

const configured = !firebaseConfig.apiKey.startsWith("PASTE");

if (!configured) {
  console.info("Firebase is not configured yet – runs are saved on this device only.");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    // Safari blocks Firestore's streaming connection ("access control checks"),
    // so use plain HTTP long-polling instead – works in every browser.
    experimentalForceLongPolling: true,
  });

  let stopListening = null;

  // Sign in / sign out button
  authBtn.addEventListener("click", async () => {
    try {
      if (auth.currentUser) {
        const waiting = pendingCount();
        const question = waiting
          ? `${waiting} change(s) have not reached the cloud yet and will be lost. Sign out anyway?`
          : "Sign out? Your runs stay saved in your account.";
        if (!confirm(question)) return;
        await signOut(auth);
        // Remove this account's runs from the device
        saveRuns([]);
        localStorage.removeItem(OWNER_KEY);
        localStorage.removeItem(PENDING_KEY);
        runsChanged();
        notify("Signed out");
      } else {
        await signInWithPopup(auth, new GoogleAuthProvider());
      }
    } catch (err) {
      console.error(err);
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
      if (err.code === "auth/unauthorized-domain") {
        notify("This website is not allowed in Firebase yet (Authorized domains).");
      } else if (err.code === "auth/popup-blocked") {
        notify("The sign-in pop-up was blocked. Allow pop-ups for this site and try again.");
      } else {
        notify("Sign-in failed. Please try again.");
      }
    }
  });

  // Lets other scripts (the AI coach) prove who the user is to the server
  window.getIdToken = () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null));

  onAuthStateChanged(auth, (user) => {
    renderAuthButton(user);
    window.dispatchEvent(new CustomEvent("auth-changed", { detail: { signedIn: Boolean(user) } }));

    if (stopListening) {
      stopListening();
      stopListening = null;
    }
    if (!user) {
      window.cloudSync = null;
      return;
    }

    const runsRef = collection(db, "users", user.uid, "runs");
    const owner = localStorage.getItem(OWNER_KEY);

    if (!owner) {
      // First sign-in on this device: every run saved as a guest needs uploading
      loadRuns().forEach((run) => setPending("saves", run.id, true));
    } else if (owner !== user.uid) {
      // Local runs belong to a different account – don't mix them in
      saveRuns([]);
      localStorage.removeItem(PENDING_KEY);
    }
    localStorage.setItem(OWNER_KEY, user.uid);

    // Every add / edit / delete in runs.js is sent to Firestore and marked as pending
    // until the server confirms it.
    window.cloudSync = {
      save(run) {
        setPending("deletes", run.id, false);
        setPending("saves", run.id, true);
        return setDoc(doc(runsRef, run.id), run).then(() => setPending("saves", run.id, false));
      },
      remove(id) {
        setPending("saves", id, false);
        setPending("deletes", id, true);
        return deleteDoc(doc(runsRef, id)).then(() => setPending("deletes", id, false));
      },
    };
    console.info("Cloud sync on for", user.email);

    // Send anything that did not reach the server before (guest runs, offline changes, reloads)
    const p = readPending();
    const localRuns = new Map(loadRuns().map((r) => [r.id, r]));
    Object.keys(p.saves).forEach((id) => {
      const run = localRuns.get(id);
      if (run) window.cloudSync.save(run).catch((err) => console.error("Upload failed:", err));
      else setPending("saves", id, false);
    });
    Object.keys(p.deletes).forEach((id) => {
      window.cloudSync.remove(id).catch((err) => console.error("Delete failed:", err));
    });
    const waiting = pendingCount();
    if (waiting) {
      console.info(`Uploading ${waiting} change(s) that were not in the cloud yet`);
      notify(`Syncing ${waiting} change${waiting > 1 ? "s" : ""} with your account…`);
    }

    // Live updates from the server. Local changes that are still pending win,
    // so a run is never lost while it is on its way to the cloud.
    stopListening = onSnapshot(
      runsRef,
      (snapshot) => {
        const pending = readPending();
        const local = new Map(loadRuns().map((r) => [r.id, r]));
        const serverIds = new Set();

        const merged = [];
        snapshot.docs.forEach((d) => {
          const run = d.data();
          serverIds.add(run.id);
          if (pending.deletes[run.id]) return;                       // deleted here, not yet on server
          merged.push(pending.saves[run.id] && local.has(run.id) ? local.get(run.id) : run);
        });
        Object.keys(pending.saves).forEach((id) => {
          if (!serverIds.has(id) && local.has(id)) merged.push(local.get(id)); // new here, not yet on server
        });

        saveRuns(merged);
        runsChanged();
        const left = pendingCount();
        console.info(`Sync: ${snapshot.size} runs in the cloud` + (left ? `, ${left} change(s) still uploading` : ""));
      },
      (err) => {
        console.error("Sync error:", err);
        notify("Cloud sync stopped. Your runs are still saved on this device.");
      }
    );
  });
}
