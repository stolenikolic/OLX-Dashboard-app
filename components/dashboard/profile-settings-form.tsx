"use client";

import { useState, useTransition } from "react";

import {
  assignRandomPostScheduleAction,
  updateProfileSettingsAction,
} from "@/lib/dashboard/actions";
import {
  formatScheduleTime,
  getNextEligibleAt,
  getWindowEndAt,
} from "@/lib/listings/post-schedule-time";
import {
  JOB_TOGGLE_LABELS,
  parseJobsEnabled,
  PROFILE_TOGGLE_JOBS,
  type JobsEnabledMap,
  type ProfileToggleJob,
} from "@/lib/workers/jobs-enabled-config";
import {
  PACING_JOBS,
  PACING_LABELS,
  parseJobPacing,
  type JobPacing,
} from "@/lib/workers/job-pacing";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const JOB_DESCRIPTIONS: Record<ProfileToggleJob, string> = {
  post_listings: "Automatsko postavljanje novih oglasa",
  refresh_prices: "Periodično obnavljanje cijena",
  sync_stock: "Sakrij/vrati oglase prema zalihama",
  refresh_listings: "Bump oglasa (score sistem)",
  sync_conversations: "Sinhronizacija OLX upita",
  sync_messages: "Sinhronizacija i slanje poruka",
};

function formatSarajevo(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("bs-BA", {
    timeZone: "Europe/Sarajevo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function pctToFrac(value: FormDataEntryValue | null): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function fracToPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return String(Number((Number(value) * 100).toFixed(2)));
}

function readPacing(fd: FormData): JobPacing | undefined {
  const current: JobPacing = {
    post_listings: { min_ms: 500, max_ms: 900 },
    refresh_prices: { min_ms: 200, max_ms: 500 },
    sync_stock: { min_ms: 200, max_ms: 500 },
    refresh_listings: { min_ms: 200, max_ms: 500 },
  };
  let any = false;
  for (const job of PACING_JOBS) {
    const minRaw = String(fd.get(`pacing_${job}_min`) ?? "").trim();
    const maxRaw = String(fd.get(`pacing_${job}_max`) ?? "").trim();
    if (!minRaw || !maxRaw) continue;
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      current[job] = { min_ms: Math.round(min), max_ms: Math.round(max) };
      any = true;
    }
  }
  return any ? current : undefined;
}

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState(
    formatScheduleTime(profile.post_schedule_time) ?? "",
  );
  const [jobsEnabled, setJobsEnabled] = useState<JobsEnabledMap>(() =>
    parseJobsEnabled(profile.jobs_enabled),
  );

  const nextEligible = getNextEligibleAt(
    {
      id: profile.id,
      post_schedule_time: scheduleTime || profile.post_schedule_time,
      posting_window_started_at: profile.posting_window_started_at,
    },
    new Date(),
  );
  const windowEnd = getWindowEndAt(profile.posting_window_started_at);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateProfileSettingsAction(profile.id, {
          name: String(fd.get("name") ?? ""),
          status: String(fd.get("status")) as Profile["status"],
          kurs: Number(fd.get("kurs")),
          kurs_uvoz: Number(fd.get("kurs_uvoz")),
          daily_post_limit: Number(fd.get("daily_post_limit")),
          post_schedule_time: String(fd.get("post_schedule_time") ?? ""),
          price_mode: String(fd.get("price_mode")) as Profile["price_mode"],
          description_template: String(fd.get("description_template") ?? ""),
          auth_method: String(fd.get("auth_method")) as Profile["auth_method"],
          olx_username: String(fd.get("olx_username") ?? ""),
          olx_login_email: String(fd.get("olx_login_email") ?? ""),
          olx_password_enc: String(fd.get("olx_password_enc") ?? ""),
          olx_client_id: String(fd.get("olx_client_id") ?? ""),
          olx_client_token_enc: String(fd.get("olx_client_token_enc") ?? ""),
          proxy_url: String(fd.get("proxy_url") ?? ""),
          jobs_enabled: jobsEnabled,
          job_pacing: readPacing(fd),
          price_variance_low_pct: pctToFrac(fd.get("price_variance_low_pct")),
          price_variance_high_pct: pctToFrac(fd.get("price_variance_high_pct")),
        });
        setMessage("Sačuvano.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  function onAssignRandom() {
    startTransition(async () => {
      try {
        const time = await assignRandomPostScheduleAction(profile.id);
        setScheduleTime(formatScheduleTime(time) ?? "");
        setMessage(`Dodijeljen termin ${formatScheduleTime(time)}.`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Osnovno</h2>
        <label className="block text-sm">
          Naziv
          <input
            name="name"
            defaultValue={profile.name}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          Status
          <select
            name="status"
            defaultValue={profile.status}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="active">Aktivan</option>
            <option value="paused">Pauziran</option>
            <option value="suspended">Suspendovan</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Kurs
            <input
              name="kurs"
              type="number"
              step="0.0001"
              defaultValue={profile.kurs}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Kurs uvoz
            <input
              name="kurs_uvoz"
              type="number"
              step="0.0001"
              defaultValue={profile.kurs_uvoz}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Dnevni limit
            <input
              name="daily_post_limit"
              type="number"
              defaultValue={profile.daily_post_limit}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
          <h3 className="text-sm font-medium text-zinc-800">
            Raspored postavljanja (Europe/Sarajevo)
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              Vrijeme postavljanja
              <input
                name="post_schedule_time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={onAssignRandom}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Dodijeli random termin
            </button>
          </div>
          <dl className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Prozor od</dt>
              <dd>{formatSarajevo(profile.posting_window_started_at)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Prozor do</dt>
              <dd>
                {windowEnd ? formatSarajevo(windowEnd.toISOString()) : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Sljedeći run ne prije</dt>
              <dd>
                {nextEligible ? formatSarajevo(nextEligible.toISOString()) : "—"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-500">
            Soft brojač: rolling 24h od prvog uspješnog posta. Hard limit
            forsira OLX (worker staje na njihovoj grešci, ne lokalno na 350).
          </p>
        </div>

        <label className="block text-sm">
          Režim obnavljanja cijena
          <select
            name="price_mode"
            defaultValue={profile.price_mode ?? "original"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="original">Originalne cijene (formula + doplata)</option>
            <option value="competitor_minus_1">
              Cijena minus 1 (Suboticani − 1 KM, min. 8% marža)
            </option>
          </select>
        </label>
        <label className="block text-sm">
          Šablon opisa
          <textarea
            name="description_template"
            rows={4}
            defaultValue={profile.description_template ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Automatizacija po poslu</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Isključeni posao se ne pokreće za ovaj profil (cron, ručno iz
            panela i povezane akcije).
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {PROFILE_TOGGLE_JOBS.map((job) => {
            const on = jobsEnabled[job];
            return (
              <li
                key={job}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {JOB_TOGGLE_LABELS[job]}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {JOB_DESCRIPTIONS[job]}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={pending}
                  onClick={() =>
                    setJobsEnabled((prev) => ({ ...prev, [job]: !prev[job] }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    on ? "bg-teal-600" : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Razmaci između poziva (ms)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Min/max pauza između API poziva za ovaj profil.
          </p>
        </div>
        {PACING_JOBS.map((job) => {
          const existing = parseJobPacing(profile.job_pacing)?.[job];
          return (
            <div key={job} className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                {PACING_LABELS[job]} min
                <input
                  name={`pacing_${job}_min`}
                  type="number"
                  min={50}
                  max={10000}
                  defaultValue={existing?.min_ms ?? ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                {PACING_LABELS[job]} max
                <input
                  name={`pacing_${job}_max`}
                  type="number"
                  min={50}
                  max={10000}
                  defaultValue={existing?.max_ms ?? ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Varijansa cijene</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Asimetrični raspon u procentima (npr. −1 do +5).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Od %
            <input
              name="price_variance_low_pct"
              type="number"
              step="0.1"
              min={-1}
              max={5}
              defaultValue={fracToPct(profile.price_variance_low_pct)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Do %
            <input
              name="price_variance_high_pct"
              type="number"
              step="0.1"
              min={-1}
              max={5}
              defaultValue={fracToPct(profile.price_variance_high_pct)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">OLX kredencijali</h2>
        <label className="block text-sm">
          Auth metoda
          <select
            name="auth_method"
            defaultValue={profile.auth_method}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="login">Login (email/lozinka)</option>
            <option value="client_token">Client token</option>
          </select>
        </label>
        <label className="block text-sm">
          OLX username
          <input
            name="olx_username"
            defaultValue={profile.olx_username ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Login email
          <input
            name="olx_login_email"
            defaultValue={profile.olx_login_email ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Lozinka (ostavi prazno da zadržiš)
          <input
            name="olx_password_enc"
            type="password"
            placeholder="••••••"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Client ID
          <input
            name="olx_client_id"
            defaultValue={profile.olx_client_id ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Client token (ostavi prazno da zadržiš)
          <input
            name="olx_client_token_enc"
            type="password"
            placeholder="••••••"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Proxy URL
          <input
            name="proxy_url"
            defaultValue={profile.proxy_url ?? ""}
            placeholder="http://user:pass@host:port"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        Sačuvaj
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </form>
  );
}
