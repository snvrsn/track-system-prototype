import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth } from "./firebase-app.js";
import {
  disablePushNotifications,
  enablePushNotifications,
  listenForForegroundNotifications,
} from "./push-client.js";

function createAuthGate() {
  const gate = document.createElement("section");
  gate.className = "auth-gate";
  gate.setAttribute("aria-labelledby", "auth-gate-title");
  gate.innerHTML = `
    <div class="auth-gate-card">
      <h1 id="auth-gate-title">Track</h1>
      <p>Sign in with Google to continue.</p>
      <button class="auth-sign-in" type="button">Continue with Google</button>
      <p class="auth-gate-status" role="status" aria-live="polite"></p>
    </div>
  `;
  document.body.append(gate);
  return gate;
}

function createAccountBar(user) {
  const bar = document.createElement("aside");
  bar.className = "account-bar";
  bar.innerHTML = `
    <button class="notification-enable" type="button">Enable notifications</button>
    <span class="account-email"></span>
    <button class="account-sign-out" type="button">Sign out</button>
    <span class="account-status" role="status" aria-live="polite"></span>
  `;
  bar.querySelector(".account-email").textContent = user.email || "Signed in";
  void listenForForegroundNotifications().catch((error) => {
    console.error("Unable to initialize foreground notifications:", error);
  });
  bar.querySelector(".notification-enable").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = bar.querySelector(".account-status");
    button.disabled = true;
    try {
      await enablePushNotifications(user);
      status.textContent = "Notifications are enabled on this device.";
    } catch (error) {
      status.textContent = error.message;
      console.error("Unable to enable browser notifications:", error);
    } finally {
      button.disabled = false;
    }
  });
  bar.querySelector(".account-sign-out").addEventListener("click", async () => {
    const status = bar.querySelector(".account-status");
    try {
      await disablePushNotifications(user);
    } catch (error) {
      status.textContent = `Could not remove this device's notification token: ${error.message}`;
      console.error("Unable to remove the signed-in user's push token:", error);
    }
    try {
      await signOut(auth);
      window.location.assign("index.html");
    } catch (error) {
      status.textContent = `Could not sign out: ${error.message}`;
      console.error("Unable to sign out:", error);
    }
  });
  document.body.append(bar);
}

export function requireSignIn() {
  document.body.classList.add("auth-pending");
  const gate = createAuthGate();
  const button = gate.querySelector(".auth-sign-in");
  const status = gate.querySelector(".auth-gate-status");
  const provider = new GoogleAuthProvider();
  let signInInProgress = false;
  let authenticated = false;

  button.addEventListener("click", async () => {
    if (signInInProgress) return;
    signInInProgress = true;
    button.disabled = true;
    status.textContent = "Opening Google sign-in…";
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      status.textContent = `Could not sign in: ${error.message}`;
      console.error("Google sign-in failed:", error);
    } finally {
      signInInProgress = false;
      button.disabled = false;
    }
  });

  return new Promise((resolve) => {
    onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          if (authenticated) window.location.assign("index.html");
          return;
        }
        if (!authenticated) {
          authenticated = true;
          gate.remove();
          document.body.classList.remove("auth-pending");
          createAccountBar(user);
          resolve(user);
        }
      },
      (error) => {
        status.textContent = `Could not check sign-in: ${error.message}`;
        console.error("Unable to observe sign-in state:", error);
      },
    );
  });
}
