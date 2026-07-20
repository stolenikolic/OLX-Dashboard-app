import Link from "next/link";

import { formatRelativeTime } from "@/lib/format/time";
import type { ConversationListItem } from "@/lib/messages/queries";

export function ConversationList({
  items,
  selectedId,
  hrefFor,
}: {
  items: ConversationListItem[];
  selectedId?: string | null;
  hrefFor: (id: string) => string;
}) {
  if (items.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-zinc-500">
        Nema razgovora za odabrane filtere.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((c) => {
        const selected = selectedId === c.id;
        return (
          <li key={c.id}>
            <Link
              href={hrefFor(c.id)}
              className={`flex gap-3 p-3 transition ${
                selected ? "bg-teal-50" : "hover:bg-zinc-50"
              }`}
            >
              {/* Placeholder avatar — listing thumb ide samo u thread header */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
                {(c.buyerUsername ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {c.buyerUsername ?? "Kupac"}
                  </p>
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    {formatRelativeTime(c.lastMessageAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {c.listingTitle ?? "Bez oglasa"}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="truncate text-xs text-zinc-400">
                    {c.isSystem
                      ? "Sistemska"
                      : c.lastMessageType === "image"
                        ? "📷 Slika"
                        : c.lastMessageType === "listing"
                          ? "🏷️ Oglas"
                          : "Poruka"}
                  </p>
                  {c.unreadCount > 0 ? (
                    <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  ) : null}
                  {c.saved ? (
                    <span className="text-[10px] text-amber-600">★</span>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
