import { supabase } from "@/lib/supabase-client";

export async function callRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
