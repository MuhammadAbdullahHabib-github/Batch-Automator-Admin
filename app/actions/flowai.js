"use server";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_BACKEND_URL = "https://flow-ai-backend.abdullah-mohammad2019274.workers.dev";
const ACTIONS = new Set(["list", "lookup", "create", "extend", "revoke", "reset"]);

// Server-only: the manual-license admin token must never reach the browser. The
// Flow AI Worker enforces it on every call; this file is the only place it lives
// in this app (same discipline as SUPABASE_SERVICE_ROLE_KEY in resellers.js).
function backendUrl() {
  return (process.env.FLOWAI_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function adminToken() {
  // Same secret as MANUAL_LICENSE_ADMIN_TOKEN on the Flow AI Worker — if you
  // rotate it there, rotate it here too (Vercel env) or all calls start 401ing.
  const token = process.env.FLOWAI_ADMIN_TOKEN;
  if (!token) throw new Error("FLOWAI_ADMIN_TOKEN is not configured");
  return token;
}

// Server Functions are reachable directly (not just through the UI), so re-verify
// the caller's identity and role here even though the Flow AI page is owner-only.
// Flow AI licenses affect a separate product's paying customers, so they stay
// owner-only like reseller management.
async function requireOwner(accessToken) {
  if (!accessToken) throw new Error("Not signed in");

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  if (error || !user) throw new Error("Not signed in");

  const { data: appUser } = await client
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (appUser?.role !== "owner") throw new Error("Not authorized");
}

// One action for every manual-license operation — mirrors the shape of the old
// admin-portal/api/licenses.js this replaces. The Worker validates inputs again
// server-side, so here we only forward a constrained payload.
export async function runFlowAiLicenseAction({ accessToken, action, payload = {} }) {
  await requireOwner(accessToken);

  if (!ACTIONS.has(action)) throw new Error("Invalid license action");

  const body = {};
  if (typeof payload.customerEmail === "string" && payload.customerEmail.trim()) {
    body.customerEmail = payload.customerEmail.trim();
  }
  if (typeof payload.licenseKey === "string" && payload.licenseKey.trim()) {
    body.licenseKey = payload.licenseKey.trim();
  }
  if (typeof payload.months === "number") body.months = payload.months;
  if (typeof payload.days === "number") body.days = payload.days;
  if (typeof payload.note === "string" && payload.note.trim()) body.note = payload.note.trim();

  const response = await fetch(`${backendUrl()}/api/manual-license/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Worker request failed (${response.status})`);
  }
  return data;
}
