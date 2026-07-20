import { cookies } from "next/headers";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ProfileSwitcher } from "@/components/dashboard/profile-switcher";
import { logout } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth/dal";
import { fetchProfileSummaries } from "@/lib/dashboard/queries";
import { fetchUnreadTotal } from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin, memberships } = await requireUser();
  const supabase = await createClient();
  const profiles = await fetchProfileSummaries(supabase);
  const jar = await cookies();
  const selectedProfileId = jar.get("dashboard_profile_id")?.value ?? null;

  const workerProfileId = !isAdmin
    ? (memberships.find((m) => m.role === "worker")?.profile_id ??
      memberships[0]?.profile_id ??
      null)
    : null;

  const unreadScope = isAdmin ? selectedProfileId : workerProfileId;
  const unreadTotal = await fetchUnreadTotal(supabase, unreadScope);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 md:flex-row">
      <DashboardSidebar
        isAdmin={isAdmin}
        email={user?.email ?? null}
        unreadTotal={unreadTotal}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <span className="font-semibold text-teal-700 md:hidden">
            OLX Dashboard
          </span>
          <div className="ml-auto flex items-center gap-3">
            {isAdmin && (
              <ProfileSwitcher
                profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
                selectedId={selectedProfileId}
              />
            )}
            <form action={logout} className="md:hidden">
              <button type="submit" className="text-sm text-zinc-600">
                Odjava
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
