import type { JobRunRow } from "@/lib/dashboard/queries";
import type { Database } from "@/types/database";

type JobStatus = Database["public"]["Enums"]["job_status"];

const jobLabels: Record<Database["public"]["Enums"]["job_type"], string> = {
  sync_feed: "Feed sync",
  post_listings: "Postavljanje",
  refresh_prices: "Cijene",
  sync_stock: "Zalihe",
};

const statusColors: Record<JobStatus, string> = {
  running: "text-blue-600",
  success: "text-emerald-600",
  partial: "text-amber-600",
  failed: "text-red-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JobRunsTable({ runs }: { runs: JobRunRow[] }) {
  if (runs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
        Nema zabilježenih poslova.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Posao</th>
            <th className="px-4 py-3 font-medium">Profil</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Vrijeme</th>
            <th className="px-4 py-3 font-medium">Rezultat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-zinc-50/50">
              <td className="px-4 py-3 font-medium text-zinc-900">
                {jobLabels[run.job] ?? run.job}
              </td>
              <td className="px-4 py-3 text-zinc-600">
                {run.profileName ?? "—"}
              </td>
              <td
                className={`px-4 py-3 font-medium capitalize ${statusColors[run.status]}`}
              >
                {run.status}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {formatDate(run.started_at)}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-zinc-600">
                {run.summary ??
                  `${run.items_succeeded}/${run.items_processed} OK`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
