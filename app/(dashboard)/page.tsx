import Link from "next/link";
import { cookies } from "next/headers";

import { ErrorsWidget } from "@/components/dashboard/errors-widget";
import { JobRunsTable } from "@/components/dashboard/job-runs-table";
import { ProfileCard } from "@/components/dashboard/profile-card";
import { RunJobsPanel } from "@/components/dashboard/run-jobs-panel";
import { getAuthContext } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  fetchDashboardTotals,
  fetchErrorSummary,
  fetchProfileSummaries,
  fetchRecentJobRuns,
} from "@/lib/dashboard/queries";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { isAdmin } = await getAuthContext();
  const jar = await cookies();
  const selectedProfileId = jar.get("dashboard_profile_id")?.value ?? null;

  const [profiles, totals, recentJobs, errors] = await Promise.all([
    fetchProfileSummaries(supabase),
    fetchDashboardTotals(supabase),
    fetchRecentJobRuns(supabase, 10),
    fetchErrorSummary(supabase),
  ]);

  const activeProfiles = profiles.filter((p) => p.status === "active");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Pregled</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Status profila, oglasi i posljednji pozadinski poslovi.
        </p>
      </div>

      <ErrorsWidget {...errors} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Aktivni oglasi (svi profili)</p>
          <p className="mt-1 text-3xl font-bold text-teal-700">
            {totals.activeListings}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Proizvoda u feed-u</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {totals.productsInFeed.toLocaleString("bs-BA")}
          </p>
        </div>
      </div>

      {isAdmin && (
        <RunJobsPanel
          profiles={activeProfiles.map((p) => ({ id: p.id, name: p.name }))}
          defaultProfileId={selectedProfileId}
        />
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Profili</h2>
          <Link
            href="/oglasi"
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            Svi oglasi →
          </Link>
        </div>
        {profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">Nema profila u bazi.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Posljednji poslovi
          </h2>
          <Link
            href="/logovi"
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            Svi logovi →
          </Link>
        </div>
        <JobRunsTable runs={recentJobs} />
      </section>
    </div>
  );
}
