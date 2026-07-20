import Link from "next/link";

import type { ProfileSummary } from "@/lib/dashboard/queries";

const statusLabels: Record<ProfileSummary["status"], string> = {
  active: "Aktivan",
  paused: "Pauziran",
  suspended: "Suspendovan",
};

const statusColors: Record<ProfileSummary["status"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  suspended: "bg-red-50 text-red-700",
};

export function ProfileCard({
  profile,
  isAdmin,
}: {
  profile: ProfileSummary;
  isAdmin?: boolean;
}) {
  const listingsHref = `/oglasi?profil=${profile.id}`;
  const limitPct =
    profile.daily_post_limit > 0
      ? Math.min(
          100,
          Math.round(
            (profile.postedToday / profile.daily_post_limit) * 100,
          ),
        )
      : 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md">
      <Link href={listingsHref} className="block">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-zinc-900 hover:text-teal-700">
              {profile.name}
            </h3>
            {profile.olx_username && (
              <p className="text-sm text-zinc-500">@{profile.olx_username}</p>
            )}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[profile.status]}`}
          >
            {statusLabels[profile.status]}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Aktivni oglasi</dt>
            <dd className="text-lg font-semibold text-teal-700">
              {profile.activeListings}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Danas postavljeno</dt>
            <dd className="text-lg font-semibold text-zinc-900">
              {profile.postedToday}
              <span className="text-sm font-normal text-zinc-400">
                {" "}
                / {profile.daily_post_limit}
              </span>
            </dd>
          </div>
          {profile.refreshFreeLimit != null && (
            <div className="col-span-2">
              <dt className="text-zinc-500">Besplatna obnavljanja (mjesec)</dt>
              <dd className="text-lg font-semibold text-sky-700">
                {profile.refreshFreeCount ?? 0}
                <span className="text-sm font-normal text-zinc-400">
                  {" "}
                  / {profile.refreshFreeLimit}
                </span>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${limitPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Dnevni limit: {limitPct}%
          </p>
        </div>

        <p className="mt-3 text-sm font-medium text-teal-600">
          Otvori oglase →
        </p>
      </Link>

      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-zinc-100 pt-3 text-xs">
          <Link
            href={`/profili/${profile.id}/podesavanja`}
            className="text-teal-600 hover:underline"
          >
            Podešavanja
          </Link>
          <Link
            href={`/profili/${profile.id}/kategorije`}
            className="text-teal-600 hover:underline"
          >
            Kategorije
          </Link>
        </div>
      )}
    </div>
  );
}
