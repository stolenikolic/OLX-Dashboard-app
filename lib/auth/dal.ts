import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Membership = Pick<
  Database["public"]["Tables"]["profile_members"]["Row"],
  "id" | "profile_id" | "role"
>;

export type AuthContext = {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  memberships: Membership[];
};

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isAdmin: false, memberships: [] };
  }

  const { data: memberships } = await supabase
    .from("profile_members")
    .select("id, profile_id, role");

  const rows = memberships ?? [];
  const isAdmin = rows.some((m) => m.role === "admin");

  return {
    user: { id: user.id, email: user.email ?? null },
    isAdmin,
    memberships: rows,
  };
});

export async function requireUser() {
  const ctx = await getAuthContext();
  if (!ctx.user) {
    redirect("/login");
  }
  return ctx;
}

export async function requireAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.user) {
    redirect("/login");
  }
  if (!ctx.isAdmin) {
    redirect("/");
  }
  return ctx;
}
