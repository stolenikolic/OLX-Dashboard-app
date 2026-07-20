import Link from "next/link";
import { cookies } from "next/headers";

import { ConversationList } from "@/components/messages/conversation-list";
import { ThreadPanel } from "@/components/messages/thread-panel";
import { PorukePoll } from "@/components/messages/poruke-poll";
import { getAuthContext } from "@/lib/auth/dal";
import {
  fetchConversationById,
  fetchConversations,
  fetchMessages,
  type ConversationFilter,
} from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    profil?: string;
    filter?: string;
    q?: string;
    c?: string;
    page?: string;
  }>;
};

export default async function PorukePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { isAdmin, memberships } = await getAuthContext();
  const supabase = await createClient();
  const jar = await cookies();

  const workerProfileId = !isAdmin
    ? (memberships.find((m) => m.role === "worker")?.profile_id ??
      memberships[0]?.profile_id ??
      null)
    : null;

  const profileId = isAdmin
    ? params.profil || jar.get("dashboard_profile_id")?.value || null
    : workerProfileId;

  const rawFilter = params.filter ?? "all";
  const filter: ConversationFilter =
    rawFilter === "unread" ||
    rawFilter === "archived" ||
    rawFilter === "saved" ||
    rawFilter === "system"
      ? rawFilter
      : "all";
  const search = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const selectedId = params.c ?? null;

  const [result, selected] = await Promise.all([
    fetchConversations(supabase, {
      profileId,
      filter,
      search: search || undefined,
      page,
    }),
    selectedId
      ? fetchConversationById(supabase, selectedId)
      : Promise.resolve(null),
  ]);

  const messages =
    selected != null
      ? await fetchMessages(supabase, selected.id, { limit: 100 })
      : [];

  function hrefFor(next: {
    filter?: string;
    q?: string;
    c?: string | null;
    page?: number;
    profil?: string | null;
  }) {
    const q = new URLSearchParams();
    const f = next.filter ?? filter;
    const query = next.q ?? search;
    const c = next.c === undefined ? selectedId : next.c;
    const p = next.page ?? page;
    const profil = next.profil === undefined ? profileId : next.profil;
    if (f && f !== "all") q.set("filter", f);
    if (query) q.set("q", query);
    if (c) q.set("c", c);
    if (p > 1) q.set("page", String(p));
    if (isAdmin && profil) q.set("profil", profil);
    const qs = q.toString();
    return qs ? `/poruke?${qs}` : "/poruke";
  }

  const filters: Array<{ value: ConversationFilter; label: string }> = [
    { value: "all", label: "Sve" },
    { value: "unread", label: "Nepročitano" },
    { value: "archived", label: "Arhivirano" },
    { value: "system", label: "Sistemske" },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3">
      <PorukePoll profileId={profileId} />

      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-zinc-900">Poruke</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Inbox po profilu — odgovori kupcima kao na OLX-u.
          {result.total > 0
            ? ` ${result.total.toLocaleString("bs-BA")} razgovora.`
            : ""}
        </p>
      </div>

      <form action="/poruke" method="get" className="flex flex-wrap gap-2">
        {isAdmin && profileId ? (
          <input type="hidden" name="profil" value={profileId} />
        ) : null}
        {filter !== "all" ? (
          <input type="hidden" name="filter" value={filter} />
        ) : null}
        {selectedId ? (
          <input type="hidden" name="c" value={selectedId} />
        ) : null}
        <input
          name="q"
          defaultValue={search}
          placeholder="Pretraga kupca ili oglasa…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Traži
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={hrefFor({ filter: f.value, page: 1, c: selectedId })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              filter === f.value
                ? "bg-teal-600 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Fiksna visina viewporta — skrola se lista / thread, ne cijela stranica */}
      <div className="grid h-[calc(100vh-13rem)] min-h-[28rem] gap-4 lg:grid-cols-[26rem_1fr]">
        <div
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ${
            selectedId ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ConversationList
              items={result.items}
              selectedId={selectedId}
              hrefFor={(id) => hrefFor({ c: id })}
            />
          </div>

          {result.totalPages > 1 ? (
            <div className="flex shrink-0 justify-between border-t border-zinc-100 px-3 py-2 text-xs">
              {page > 1 ? (
                <Link
                  href={hrefFor({ page: page - 1 })}
                  className="text-teal-600 hover:underline"
                >
                  ← Prethodna
                </Link>
              ) : (
                <span />
              )}
              <span className="text-zinc-400">
                {page}/{result.totalPages}
              </span>
              {page < result.totalPages ? (
                <Link
                  href={hrefFor({ page: page + 1 })}
                  className="text-teal-600 hover:underline"
                >
                  Sljedeća →
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </div>

        <div
          className={`min-h-0 ${selectedId ? "block" : "hidden lg:block"}`}
        >
          {selected ? (
            <ThreadPanel
              key={selected.id}
              conversation={selected}
              initialMessages={messages}
              backHref={hrefFor({ c: null })}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white p-12 text-sm text-zinc-500">
              Odaberi razgovor s liste.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
