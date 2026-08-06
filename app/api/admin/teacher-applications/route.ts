import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = adminClient();
    const [{ data: profiles, error: profileError }, { data: users, error: usersError }] = await Promise.all([
      supabase
        .from("teacher_profiles")
        .select("user_id, display_name, approval_status, application_message, applied_at, reviewed_at, created_at")
        .order("applied_at", { ascending: false, nullsFirst: false }),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profileError || usersError) throw profileError ?? usersError;
    const emailById = new Map((users?.users ?? []).map((user) => [user.id, user.email ?? null]));
    return NextResponse.json({
      applications: (profiles ?? []).map((profile) => ({ ...profile, email: emailById.get(profile.user_id) ?? null })),
    });
  } catch (error) {
    console.error("Failed to load teacher applications", error);
    return NextResponse.json({ error: "Failed to load teacher applications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as { userId?: string; status?: string };
  if (!payload.userId || !["pending", "approved", "rejected"].includes(payload.status ?? "")) {
    return NextResponse.json({ error: "A valid user and approval status are required." }, { status: 400 });
  }
  try {
    const { data, error } = await adminClient()
      .from("teacher_profiles")
      .update({ approval_status: payload.status, reviewed_at: payload.status === "pending" ? null : new Date().toISOString() })
      .eq("user_id", payload.userId)
      .select("user_id, approval_status, reviewed_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ application: data });
  } catch (error) {
    console.error("Failed to update teacher application", error);
    return NextResponse.json({ error: "Failed to update teacher application." }, { status: 500 });
  }
}
