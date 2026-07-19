"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  cancelPostJobAction,
  dispatchCategoryPostAction,
  getActivePostJobAction,
  getJobLogsAction,
  previewCategoryPostAction,
  updateCategoryPriorityAction,
  type CategoryPostPreview,
} from "@/lib/dashboard/actions";
import type { ActivePostJob, JobLogRow } from "@/lib/dashboard/queries";

type CategoryRow = {
  id: string;
  internal_slug: string;
  internal_name: string;
  olx_category_id: number | null;
  is_postable: boolean;
};

type PriorityRow = {
  category_id: string;
  priority: number;
  enabled: boolean;
};

function disabledReason(row: {
  enabled: boolean;
  mapped: boolean;
  isPostable: boolean;
}): string | null {
  if (!row.enabled) return "Kategorija je isključena (enabled).";
  if (!row.mapped) return "Kategorija nije mapirana na OLX.";
  if (!row.isPostable) return "Kategorija nije postable.";
  return null;
}

export function CategoryPriorityForm({
  profileId,
  categories,
  existing,
}: {
  profileId: string;
  categories: CategoryRow[];
  existing: PriorityRow[];
}) {
  const existingMap = new Map(existing.map((e) => [e.category_id, e]));
  const [rows, setRows] = useState(
    categories.map((cat, index) => {
      const ex = existingMap.get(cat.id);
      return {
        categoryId: cat.id,
        slug: cat.internal_slug,
        name: cat.internal_name,
        mapped: cat.olx_category_id != null,
        isPostable: cat.is_postable,
        priority: ex?.priority ?? index,
        enabled: ex?.enabled ?? cat.olx_category_id != null,
      };
    }),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [actionsUrl, setActionsUrl] = useState<string | null>(null);

  const [preview, setPreview] = useState<CategoryPostPreview | null>(null);
  const [previewCategoryId, setPreviewCategoryId] = useState<string | null>(
    null,
  );

  const [activeJob, setActiveJob] = useState<ActivePostJob | null>(null);
  const [logs, setLogs] = useState<JobLogRow[]>([]);
  const [awaitingJob, setAwaitingJob] = useState(false);

  const refreshActiveJob = useCallback(async () => {
    try {
      const job = await getActivePostJobAction(profileId);
      setActiveJob(job);
      return job;
    } catch {
      return null;
    }
  }, [profileId]);

  useEffect(() => {
    void refreshActiveJob();
  }, [refreshActiveJob]);

  // Nakon dispatcha čekaj da se pojavi job_run (Actions startup).
  useEffect(() => {
    if (!awaitingJob) return;
    let cancelled = false;
    let attempts = 0;

    async function tick() {
      const job = await refreshActiveJob();
      if (cancelled) return;
      if (job || attempts >= 45) {
        setAwaitingJob(false);
        return;
      }
      attempts++;
    }

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [awaitingJob, refreshActiveJob]);

  useEffect(() => {
    if (!activeJob) return;

    let cancelled = false;
    let lastCreatedAt: string | undefined;

    async function poll() {
      try {
        const job = await getActivePostJobAction(profileId);
        if (cancelled) return;
        setActiveJob(job);

        if (!job) {
          // Job završio — povuci zadnje logove jednom ako smo ih imali
          return;
        }

        const nextLogs = await getJobLogsAction(job.id, lastCreatedAt);
        if (cancelled) return;
        if (nextLogs.length > 0) {
          lastCreatedAt = nextLogs[nextLogs.length - 1]?.created_at;
          setLogs((prev) => {
            const seen = new Set(prev.map((l) => l.id));
            const merged = [...prev];
            for (const row of nextLogs) {
              if (!seen.has(row.id)) merged.push(row);
            }
            return merged;
          });
        }
      } catch {
        // ignore poll errors
      }
    }

    void poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeJob?.id, profileId]);

  function save() {
    startTransition(async () => {
      try {
        await updateCategoryPriorityAction(
          profileId,
          rows.map((r) => ({
            categoryId: r.categoryId,
            priority: r.priority,
            enabled: r.enabled,
          })),
        );
        setMessage("Sačuvano.");
        setActionsUrl(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
        setActionsUrl(null);
      }
    });
  }

  function openPreview(categoryId: string) {
    startTransition(async () => {
      try {
        const data = await previewCategoryPostAction(profileId, categoryId);
        setPreview(data);
        setPreviewCategoryId(categoryId);
        setMessage(null);
        setActionsUrl(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
        setPreview(null);
        setPreviewCategoryId(null);
      }
    });
  }

  function confirmDispatch() {
    if (!previewCategoryId) return;
    startTransition(async () => {
      try {
        const res = await dispatchCategoryPostAction(
          profileId,
          previewCategoryId,
        );
        setMessage(res.message);
        setActionsUrl(res.actionsUrl);
        setPreview(null);
        setPreviewCategoryId(null);
        setLogs([]);
        setAwaitingJob(true);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  function stopJob() {
    startTransition(async () => {
      try {
        const res = await cancelPostJobAction(profileId);
        setMessage(res.message);
        await refreshActiveJob();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  const jobRunning = activeJob != null || awaitingJob;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-2">Kategorija</th>
              <th className="px-4 py-2">Prioritet</th>
              <th className="px-4 py-2">Enabled</th>
              <th className="px-4 py-2">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const reason = disabledReason(row);
              const canPost = reason == null && !jobRunning;
              return (
                <tr key={row.categoryId} className="border-t border-zinc-100">
                  <td className="px-4 py-2">
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 text-xs text-zinc-400">
                      {row.slug}
                    </span>
                    {!row.mapped && (
                      <span className="ml-2 text-xs text-amber-600">
                        nemapirano
                      </span>
                    )}
                    {row.mapped && !row.isPostable && (
                      <span className="ml-2 text-xs text-amber-600">
                        nije postable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={row.priority}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...row, priority: Number(e.target.value) };
                        setRows(next);
                      }}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...row, enabled: e.target.checked };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      disabled={pending || !canPost}
                      title={
                        jobRunning
                          ? "Postavljanje već radi za ovaj profil."
                          : (reason ?? "Pokreni postavljanje ove kategorije")
                      }
                      onClick={() => openPreview(row.categoryId)}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Pokreni postavljanje
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Sačuvaj prioritet
        </button>
        {message && (
          <p className="text-sm text-zinc-600">
            {message}
            {actionsUrl && (
              <>
                {" "}
                <a
                  href={actionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-600 underline"
                >
                  GitHub Actions
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">
              Potvrdi postavljanje
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Kategorija: <strong>{preview.categoryName}</strong> (
              {preview.categorySlug})
            </p>
            <ul className="mt-3 space-y-1 text-sm text-zinc-700">
              <li>U feedu (kategorija): {preview.totalInFeed}</li>
              <li>Već postavljeno (duplikati): {preview.alreadyListed}</li>
              <li>
                Može se postaviti (bez duplikata): {preview.candidates}
              </li>
              <li>
                Preostalo danas: {preview.remaining} / {preview.dailyLimit}{" "}
                (postavljeno {preview.postedToday})
              </li>
              <li className="font-medium text-zinc-900">
                U ovom runu: {preview.willPost} oglasa
              </li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPreview(null);
                  setPreviewCategoryId(null);
                }}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                Otkaži
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  preview.remaining <= 0 ||
                  preview.candidates <= 0
                }
                onClick={confirmDispatch}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Pokreni
              </button>
            </div>
          </div>
        </div>
      )}

      {(activeJob || logs.length > 0 || awaitingJob) && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-zinc-900">Live log</h3>
              <p className="text-xs text-zinc-500">
                {activeJob
                  ? activeJob.cancel_requested
                    ? "Zaustavljanje u toku…"
                    : `Job radi — objavljeno ${activeJob.items_succeeded}, greške ${activeJob.items_failed}`
                  : awaitingJob
                    ? "Čekam da GitHub Actions pokrene job…"
                    : "Zadnji logovi (job više nije running)"}
              </p>
            </div>
            {activeJob && (
              <button
                type="button"
                disabled={pending || activeJob.cancel_requested}
                onClick={stopJob}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Zaustavi
              </button>
            )}
          </div>
          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-zinc-400">Čekam logove…</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={
                    log.level === "error"
                      ? "text-red-700"
                      : log.level === "warn"
                        ? "text-amber-700"
                        : "text-zinc-700"
                  }
                >
                  <span className="text-zinc-400">
                    {new Date(log.created_at).toLocaleTimeString("bs-BA")}
                  </span>{" "}
                  [{log.level}] {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
