import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Single browser client — supabase-js persists the session (and refreshes tokens)
// in localStorage on its own, so no hand-rolled session storage is needed anymore.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
