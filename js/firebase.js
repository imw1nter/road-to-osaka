// ===== Road to Osaka – Firebase login and cloud sync =====
// Google sign-in with Firebase Authentication, runs saved in Cloud Firestore at
//   users/{uid}/runs/{runId}
// localStorage stays as the fast local copy; this file keeps it in sync with the cloud.

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const OWNER_KEY = "rto-owner"; // uid of the account the local runs belong to
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
    img.referrerPolicy = "no-referrer";
    authBtn.append(img);
  }
  const firstName = (user.displayName || user.email || "Account").split(" ")[0];
  authBtn.append(firstName);
  authBtn.title = `Signed in as ${user.email} – click to sign out`;
}

// ---------- Start ----------

const configured = !firebaseConfig.apiKey.startsWith("PASTE");

if (!configured) {
  console.info("Firebase is not configured yet – runs are saved on this device only.");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    // Keeps a copy in the browser so the app works offline and syncs later
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let stopListening = null;

  // Sign in / sign out button
  authBtn.addEventListener("click", async () => {
    try {
      if (auth.currentUser) {
        if (!confirm("Sign out? Your runs stay saved in your account.")) return;
        await signOut(auth);
        // Remove this account's runs from the device
        saveRuns([]);
        localStorage.removeItem(OWNER_KEY);
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

  onAuthStateChanged(auth, async (user) => {
    renderAuthButton(user);

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

    // First sign-in on this device: upload runs that were saved as a guest
    if (!owner) {
      const localRuns = loadRuns();
      try {
        for (let i = 0; i < localRuns.length; i += 400) {
          const batch = writeBatch(db); // a batch can hold up to 500 writes
          localRuns.slice(i, i + 400).forEach((run) => batch.set(doc(runsRef, run.id), run));
          await batch.commit();
        }
        if (localRuns.length) notify(`${localRuns.length} run${localRuns.length > 1 ? "s" : ""} uploaded to your account`);
      } catch (err) {
        console.error("Upload of local runs failed:", err);
        notify("Could not upload your saved runs. They are still on this device.");
        return;
      }
    } else if (owner !== user.uid) {
      // Local runs belong to a different account – don't mix them in
      saveRuns([]);
    }
    localStorage.setItem(OWNER_KEY, user.uid);

    // From now on, every add / edit / delete in runs.js is also sent to Firestore
    window.cloudSync = {
      save: (run) => setDoc(doc(runsRef, run.id), run),
      remove: (id) => deleteDoc(doc(runsRef, id)),
    };

    // Live updates: the local copy always matches the cloud (also changes from other devices)
    stopListening = onSnapshot(
      runsRef,
      (snapshot) => {
        saveRuns(snapshot.docs.map((d) => d.data()));
        runsChanged();
      },
      (err) => {
        console.error("Sync error:", err);
        notify("Cloud sync stopped. Your runs are still saved on this device.");
      }
    );
  });
}