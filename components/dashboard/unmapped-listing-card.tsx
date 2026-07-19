"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConnectProductDialog } from "@/components/dashboard/connect-product-dialog";
import {
  finishUnmappedListingAction,
  hideUnmappedListingAction,
} from "@/lib/dashboard/actions";
import type { UnmappedListingRow } from "@/lib/dashboard/queries";

export function UnmappedListingCard({
  listing,
}: {
  listing: UnmappedListingRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [connectOpen, setConnectOpen] = useState(false);
  const olxUrl = `https://olx.ba/artikal/${listing.olx_listing_id}`;

  function run(action: () => Promise<void>) {
    startTransition(() => {
      action()
        .then(() => router.refresh())
        .catch((err) => {
          alert(err instanceof Error ? err.message : "Greška");
        });
    });
  }

  const btn =
    "rounded border px-2 py-1 text-xs disabled:opacity-50";

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-zinc-100">
        {listing.image_url ? (
          <Image
            src={listing.image_url}
            alt={listing.title}
            fill
            className="object-contain p-2"
            sizes="(max-width:768px) 100vw, 280px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Nema slike
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white">
          Nemapiran
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900">
          {listing.title}
        </h3>

        <p className="mt-2 text-lg font-bold text-teal-700">
          {listing.price != null ? `${listing.price} KM` : "—"}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Link
            href={olxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-teal-600 hover:underline"
          >
            OLX #{listing.olx_listing_id}
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConnectOpen(true)}
            className={`${btn} border-teal-200 text-teal-700 hover:bg-teal-50`}
          >
            Poveži
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => hideUnmappedListingAction(listing.id))}
            className={`${btn} border-zinc-200 text-zinc-600 hover:bg-zinc-50`}
          >
            Sakrij
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Završiti ovaj oglas na OLX-u?")) return;
              run(() => finishUnmappedListingAction(listing.id));
            }}
            className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}
          >
            Završi
          </button>
        </div>
      </div>

      {connectOpen && (
        <ConnectProductDialog
          unmappedId={listing.id}
          listingTitle={listing.title}
          onClose={() => setConnectOpen(false)}
        />
      )}
    </article>
  );
}
