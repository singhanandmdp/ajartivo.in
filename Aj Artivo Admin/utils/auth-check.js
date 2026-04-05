import { supabase, getCurrentUser, getUserProfile, isAdminRole, normalizeEmail, normalizeRole } from "../js/supabase-auth.js";

const PROFILE_KEY = "ajartivo_admin_profile";
const NOTICE_KEY = "ajartivo_auth_notice";

function resolveProfileName(user, profile) {
  const profileName = String(profile && profile.name || "").trim();
  const metadataName = String(
    user && user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name) || ""
  ).trim();
  return profileName || metadataName || normalizeEmail(user && user.email);
}

function setProfile(user, role, profile) {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      id: String(user && user.id || ""),
      username: normalizeEmail(user.email),
      name: resolveProfileName(user, profile),
      email: normalizeEmail(user.email),
      role: normalizeRole(role),
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
  alert("Access Denied");
  window.location.href = "/index.html";
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

    const profile = await getUserProfile(user);
    const role = normalizeRole(profile && profile.role);

    if (!profile || !isAdminRole(role)) {
      clearProfile();
      await supabase.auth.signOut();
      denyAndRedirect();
      return;
    }

    setProfile(user, role, profile);
  } catch (error) {
    clearProfile();
    window.location.href = "index.html";
  }
}
