import { supabase, getCurrentUser, getAdminRole, isAdminRole, normalizeEmail } from "../js/supabase-auth.js";

const PROFILE_KEY = "ajartivo_admin_profile";
const NOTICE_KEY = "ajartivo_auth_notice";

function setProfile(user, role) {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      id: String(user && user.id || ""),
      username: normalizeEmail(user.email),
      email: normalizeEmail(user.email),
      role: String(role || "").trim().toLowerCase() || "admin",
      isLoggedIn: true,
      loggedInAt: new Date().toISOString()
    })
  );
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

function denyAndRedirect() {
  sessionStorage.setItem(NOTICE_KEY, "Access denied");
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", function () {
  if (document.body.dataset.page === "login") {
    return;
  }

  verifyAdminAccess();
});

async function verifyAdminAccess() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      clearProfile();
      window.location.href = "index.html";
      return;
    }

    const role = await getAdminRole(user);

    if (!isAdminRole(role)) {
      clearProfile();
      await supabase.auth.signOut();
      denyAndRedirect();
      return;
    }

    setProfile(user, role);
  } catch (error) {
    clearProfile();
    window.location.href = "index.html";
  }
}
