import { JobRunsTable } from "@/components/dashboard/job-runs-table";
import { createClient } from "@/lib/supabase/server";
import { fetchRecentJobRuns } from "@/lib/dashboard/queries";

export default async function LogoviPage() {
  const supabase = await createClient();
  const runs = await fetchRecentJobRuns(supabase, 50);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Logovi</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Historija pozadinskih poslova (feed, postavljanje, cijene, zalihe).
        </p>
      </div>

      <JobRunsTable runs={runs} />
    </div>
  );
}
