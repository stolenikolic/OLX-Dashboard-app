"use client";

import Link from "next/link";
import { useTransition } from "react";

import {
  archiveConversationAction,
  setSavedAction,
} from "@/lib/messages/actions";
import type { ConversationListItem } from "@/lib/messages/queries";

export function ThreadHeader({
  conversation,
  backHref,
}: {
  conversation: ConversationListItem;
  backHref?: string;
}) {
  const [pending, startTransition] = useTransition();

  const olxListingUrl = conversation.olxListingId
    ? `https://olx.ba/artikal/${conversation.olxListingId}`
    : null;
  const dashListingUrl = conversation.olxListingId
    ? `/oglasi?profil=${conversation.profileId}&q=${encodeURIComponent(conversation.listingTitle ?? "")}`
    : null;

  return (
    <div className="flex flex-wrap items-start gap-3 border-b border-zinc-200 bg-white p-3">
      {backHref ? (
        <Link
          href={backHref}
          className="mr-1 text-sm font-medium text-teal-600 md:hidden"
        >
          ← Nazad
        </Link>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
          {(conversation.buyerUsername ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-900">
            {conversation.buyerUsername ?? "Kupac"}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {conversation.listingTitle ?? "Bez oglasa"}
          </p>
        </div>
      </div>

      {conversation.olxListingId ? (
        <div className="flex max-w-xs items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
          {conversation.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conversation.thumbnail}
              alt=""
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-zinc-200" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-zinc-800">
              {conversation.listingTitle}
            </p>
            {conversation.listingPrice != null ? (
              <p className="text-xs text-teal-700">
                {conversation.listingPrice} KM
              </p>
            ) : null}
            <div className="mt-0.5 flex gap-2 text-[11px]">
              {dashListingUrl ? (
                <Link href={dashListingUrl} className="text-teal-600 hover:underline">
                  Dashboard
                </Link>
              ) : null}
              {olxListingUrl ? (
                <a
                  href={olxListingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-600 hover:underline"
                >
                  OLX
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setSavedAction(conversation.id, !conversation.saved);
            })
          }
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {conversation.saved ? "Ukloni sačuvano" : "Sačuvaj"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await archiveConversationAction(
                conversation.id,
                !conversation.archived,
              );
            })
          }
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {conversation.archived ? "Vrati" : "Arhiviraj"}
        </button>
      </div>
    </div>
  );
}
