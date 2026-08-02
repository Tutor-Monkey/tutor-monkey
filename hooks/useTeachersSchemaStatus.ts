import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * "checking"  – still probing the database
 * "ready"     – the Teachers workspace tables exist and are readable
 * "not-applied" – the migration (supabase/migrations/) hasn't been applied
 *               (or the query failed for any other reason)
 */
export type TeachersSchemaStatus = "checking" | "ready" | "not-applied";

/**
 * Detects whether the Teachers workspace tables exist in the connected
 * Supabase project. Uses only the browser client (public anon key), so a
 * successful read means the tables exist AND RLS lets the signed-in user see
 * them. Any error — missing table (PGRST205), RLS denial, network failure —
 * degrades to "not-applied" so the UI can show a disabled/coming-next state
 * instead of crashing or pretending persistence exists.
 */
export function useTeachersSchemaStatus(): TeachersSchemaStatus {
  const [status, setStatus] = useState<TeachersSchemaStatus>("checking");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("not-applied");
      return;
    }

    // Narrow to a non-null binding so the async closure below type-checks.
    const client = supabase;
    let active = true;

    async function check() {
      try {
        const { error } = await client
          .from("course_workspaces")
          .select("id")
          .limit(1);
        if (active) {
          setStatus(error ? "not-applied" : "ready");
        }
      } catch {
        if (active) {
          setStatus("not-applied");
        }
      }
    }

    void check();

    return () => {
      active = false;
    };
  }, []);

  return status;
}
