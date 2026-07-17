import Image from "next/image";
import Link from "next/link";

import { ImportOverrideToggle } from "@/components/dashboard/import-override-toggle";
import { ListingActions } from "@/components/dashboard/listing-actions";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { ListingRow } from "@/lib/dashboard/queries";

export function ListingCard({ listing }: { listing: ListingRow }) {
  const olxUrl = listing.olx_listing_id
    ? `https://olx.ba/artikal/${listing.olx_listing_id}`
    : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-zinc-100">
        {listing.productImage ? (
          <Image
            src={listing.productImage}
            alt={listing.productTitle ?? "Oglas"}
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
        {!listing.inFeed && (
          <span className="absolute left-2 top-2 rounded bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
            Van feed-a
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={listing.status} />
          <span className="text-xs text-zinc-400">{listing.profileName}</span>
        </div>

        <h3 className="mt-2 line-clamp-2 text-sm font-medium text-zinc-900">
          {listing.productTitle ?? "—"}
        </h3>

        {listing.categorySlug && (
          <p className="mt-1 text-xs text-zinc-500">{listing.categorySlug}</p>
        )}

        <p className="mt-2 text-lg font-bold text-teal-700">
          {listing.posted_price != null
            ? `${listing.posted_price} KM`
            : "—"}
        </p>

        {listing.product_id && listing.importOverride && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Uvoz:</span>
            <ImportOverrideToggle
              productId={listing.product_id}
              value={listing.importOverride}
            />
          </div>
        )}

        {listing.error && (
          <p className="mt-2 line-clamp-2 text-xs text-red-600">
            {listing.error}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {olxUrl && (
            <Link
              href={olxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-teal-600 hover:underline"
            >
              OLX #{listing.olx_listing_id}
            </Link>
          )}
          <ListingActions
            listingId={listing.id}
            status={listing.status}
          />
        </div>
      </div>
    </article>
  );
}
