"use client";

import { useState, useTransition } from "react";

import { dispatchWorkflowAction } from "@/lib/dashboard/actions";
import type { WorkflowName } from "@/lib/github/dispatch";

const jobs: Array<{ workflow: WorkflowName; label: string }> = [
  { workflow: "sync-feed", label: "Sync feed" },
  { workflow: "sync-stock", label: "Sync stock" },
  { workflow: "post-listings", label: "Post oglasi" },
  { workflow: "refresh-prices", label: "Refresh cijene" },
  { workflow: "sync-conversations", label: "Sinhronizuj upite" },
  { workflow: "refresh-listings", label: "Obnovi oglase" },
];

export function RunJobsPanel({
  profiles,
  defaultProfileId,
}: {
  profiles: Array<{ id: string; name: string }>;
  defaultProfileId?: string | null;
}) {
  const [profileId, setProfileId] = useState(defaultProfileId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(workflow: WorkflowName) {
    startTransition(async () => {
      try {
        const msg = await dispatchWorkflowAction(
          workflow,
          profileId || undefined,
        );
        setMessage(msg);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-zinc-900">Pokreni sad</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Okida GitHub Actions workflow (zahtijeva GH_DISPATCH_TOKEN).
      </p>

      {profiles.length > 0 && (
        <label className="mt-4 block text-sm">
          <span className="text-zinc-600">Profil (opcionalno)</span>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">Svi aktivni profili</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {jobs.map((job) => (
          <button
            key={job.workflow}
            type="button"
            disabled={pending}
            onClick={() => run(job.workflow)}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {job.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="mt-3 text-sm text-zinc-600">{message}</p>
      )}
    </div>
  );
}
