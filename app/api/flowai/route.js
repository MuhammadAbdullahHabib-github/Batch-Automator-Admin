import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BACKEND_URL = "https://flow-ai-backend.abdullah-mohammad2019274.workers.dev";
const ACTIONS = new Set(["list", "lookup", "create", "extend", "revoke", "reset", "delete"]);

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

// Server-only: uses the service-role key, which must never reach the browser.
// The role lookup MUST go through this client (not the anon key): app_users is
// RLS-protected, and auth.getUser(accessToken) validates the token without
// attaching the caller's JWT to subsequent PostgREST queries — so an anon-key
// lookup reads as anonymous, gets zero rows, and every call 401s. Same pattern
// as app/actions/resellers.js, which uses the service role for the same check.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// This route is reachable directly (not just through the UI), so re-verify the
// caller's identity and role here even though the Flow AI page is owner-only.
// The browser sends its Supabase access token as a Bearer token; the Worker's
// admin token never leaves the server.
async function requireOwner(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return null;

  const client = adminClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: appUser } = await client
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .single();
  return appUser?.role === "owner" ? user : null;
}

// One endpoint for every manual-license operation — mirrors the shape of the old
// admin-portal/api/licenses.js this replaces. The Worker validates inputs again
// server-side, so here we only forward a constrained payload.
export async function POST(request) {
  const owner = await requireOwner(request);
  if (!owner) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  let token;
  try {
    token = adminToken();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action, payload = {} } = body ?? {};
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid license action" }, { status: 400 });
  }

  const forward = {};
  if (typeof payload.customerEmail === "string" && payload.customerEmail.trim()) {
    forward.customerEmail = payload.customerEmail.trim();
  }
  if (typeof payload.licenseKey === "string" && payload.licenseKey.trim()) {
    forward.licenseKey = payload.licenseKey.trim();
  }
  if (typeof payload.months === "number") forward.months = payload.months;
  if (typeof payload.days === "number") forward.days = payload.days;
  if (typeof payload.note === "string" && payload.note.trim()) forward.note = payload.note.trim();
  if (typeof payload.whatsapp === "string" && payload.whatsapp.trim()) {
    forward.whatsapp = payload.whatsapp.trim();
  }

  let response;
  try {
    response = await fetch(`${backendUrl()}/api/manual-license/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forward),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the Flow AI backend" }, { status: 502 });
  }

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
