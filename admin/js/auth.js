import { supabase, getCurrentUser, getAdminRole, isAdminRole, normalizeEmail } from "./supabase-auth.js";

const PROFILE_KEY = "ajartivo_admin_profile";
const NOTICE_KEY = "ajartivo_auth_notice";

function setProfile(user, role) {
  const email = normalizeEmail(user && user.email);
  if (!email) {
    localStorage.removeItem(PROFILE_KEY);
    return;
  }

  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      id: String(user && user.id || ""),
      username: email,
      email: email,
      role: String(role || "").trim().toLowerCase() || "admin",
      isLoggedIn: true,
      loggedInAt: new Date().toISOString()
    })
  );
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

function setNotice(message) {
  if (message) {
    sessionStorage.setItem(NOTICE_KEY, message);
  }
}

function consumeNotice() {
  const message = sessionStorage.getItem(NOTICE_KEY);
  if (message) {
    sessionStorage.removeItem(NOTICE_KEY);
  }
  return message || "";
}

function mapAuthError(error) {
  const message = String(error && (error.message || error.code) || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (message.includes("invalid email")) {
    return "Please enter a valid email address.";
  }
  if (message.includes("too many requests")) {
    return "Too many attempts. Try again after some time.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Network error. Check your connection and retry.";
  }
  if (message.includes("email not confirmed")) {
    return "Please verify your email before logging in.";
  }
  if (message.includes("json object requested")) {
    return "Admin role record not found in Supabase users table.";
  }

  return "Login failed. Please try again.";
}

async function logout() {
  clearProfile();
  try {
    await supabase.auth.signOut();
  } finally {
    window.location.href = "index.html";
  }
}

function bindLogoutButtons() {
  const buttons = document.querySelectorAll("[data-action='logout']");
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      logout();
    });
  });
}

function updateLoginMessage(node, message) {
  if (!node) {
    return;
  }

  if (message) {
    node.textContent = message;
    node.style.display = "block";
    return;
  }

  node.textContent = "";
  node.style.display = "none";
}

function setLoadingState(button, isLoading) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? "Logging in..." : "Login to Dashboard";
}

function bindPasswordToggle() {
  const passwordInput = document.getElementById("password");
  const toggleButton = document.getElementById("passwordToggle");

  if (!passwordInput || !toggleButton) {
    return;
  }

  toggleButton.addEventListener("click", function () {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    toggleButton.setAttribute("aria-pressed", shouldShow ? "true" : "false");
    toggleButton.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  });
}

function bindLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) {
    return;
  }

  const errorBox = document.getElementById("loginError");
  const card = document.getElementById("loginCard");
  const submitButton = form.querySelector("button[type='submit']");

  const initialNotice = consumeNotice();
  if (initialNotice) {
    updateLoginMessage(errorBox, initialNotice);
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    updateLoginMessage(errorBox, "");

    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || "");

    setLoadingState(submitButton, true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        throw error;
      }

      const user = data && data.user ? data.user : await getCurrentUser();

      if (!user) {
        throw new Error("Login failed. User session not found.");
      }

      const role = await getAdminRole(user);
      if (!isAdminRole(role)) {
        await supabase.auth.signOut();
        clearProfile();
        updateLoginMessage(errorBox, "Access denied");
        card.classList.remove("is-error");
        void card.offsetWidth;
        card.classList.add("is-error");
        return;
      }

      setProfile(user, role);
      window.location.href = "dashboard.html";
    } catch (error) {
      clearProfile();
      updateLoginMessage(errorBox, mapAuthError(error));
      card.classList.remove("is-error");
      void card.offsetWidth;
      card.classList.add("is-error");
    } finally {
      setLoadingState(submitButton, false);
    }
  });
}

async function handleLoginPageAuthState() {
  if (document.body.dataset.page !== "login") {
    return;
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      clearProfile();
      return;
    }

    const role = await getAdminRole(user);
    if (!isAdminRole(role)) {
      await supabase.auth.signOut();
      clearProfile();
      setNotice("Access denied");
      return;
    }

    setProfile(user, role);
    window.location.href = "dashboard.html";
  } catch (error) {
    clearProfile();
  }
}

window.AjartivoAuth = {
  logout: logout
};

document.addEventListener("DOMContentLoaded", function () {
  bindLogoutButtons();
  bindLoginForm();
  bindPasswordToggle();
  handleLoginPageAuthState();
});
