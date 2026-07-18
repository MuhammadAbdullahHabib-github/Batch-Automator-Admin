"use server";

import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service-role key, which must never reach the browser. This is
// the one operation in the app that needs it — creating a login requires Supabase's
// admin API, everything else stays on the anon-key client used everywhere in the UI.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Server Functions are reachable directly (not just through the UI), so re-verify the
// caller's identity and role here even though the Resellers page already hides this
// action from non-owners.
async function requireOwner(client, accessToken) {
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

export async function createReseller({ accessToken, email, password, displayName }) {
  const client = adminClient();
  await requireOwner(client, accessToken);

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw new Error(createError.message);

  const { error: roleError } = await client
    .from("app_users")
    .insert({ user_id: created.user.id, role: "reseller", display_name: displayName || null });
  if (roleError) {
    // Roll back the auth user so we don't leave an orphaned login with no role row.
    await client.auth.admin.deleteUser(created.user.id);
    throw new Error(roleError.message);
  }

  return { userId: created.user.id };
}

// Generates a fresh temporary password for a reseller who's lost theirs. The old
// password stops working the instant this runs — there's no way to recover the old
// one (it was never stored anywhere, only a one-way hash of it), so issuing a new one
// is the only way back in for them.
export async function resetResellerPassword({ accessToken, userId }) {
  const client = adminClient();
  await requireOwner(client, accessToken);

  const { data: target } = await client
    .from("app_users")
    .select("role")
    .eq("user_id", userId)
    .single();
  if (target?.role !== "reseller") throw new Error("Not a reseller account");

  const newPassword = randomBytes(15).toString("base64url");
  const { error } = await client.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(error.message);

  return { password: newPassword };
}
