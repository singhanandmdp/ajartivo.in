import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hlmyjnslyijgdrfuktun.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_VZYzXaf0npSI8sdhgsIFjQ_1i-SMZY6";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }

  return data && data.user ? data.user : null;
}

export async function getUserProfile(user) {
  const userId = user && user.id ? String(user.id).trim() : "";
  const email = normalizeEmail(user && user.email);

  if (userId) {
    const byId = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!byId.error && byId.data) {
      return byId.data;
    }
  }

  if (email) {
    const byEmail = await supabase.from("profiles").select("*").eq("email", email).maybeSingle();
    if (byEmail.error) {
      throw byEmail.error;
    }
    return byEmail.data || null;
  }

  return null;
}

export async function getAdminRole(user) {
  const profile = await getUserProfile(user);
  return normalizeRole(profile && profile.role);
}

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "moderator") {
    return "moderator";
  }
  return "user";
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}
