"use client";

import { useEffect, useState } from "react";
import { callRpc } from "@/lib/api";

// Shared by the Dashboard and Clients pages so both read the same profiles list
// through identical fetch/loading/status-message behavior.
export function useProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProfiles() {
    setLoading(true);
    setStatus("Loading...");
    try {
      const rows = await callRpc("admin_list_profiles");
      setProfiles(rows ?? []);
      setStatus(`${rows?.length ?? 0} email(s).`);
    } catch (err) {
      setStatus(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfiles();
  }, []);

  return { profiles, status, setStatus, loading, reload: loadProfiles };
}
