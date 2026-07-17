"use client";

import { useTransition } from "react";

import {
  finishListingAction,
  hideListingAction,
  refreshListingPriceAction,
  unhideListingAction,
} from "@/lib/dashboard/actions";
import type { Database } from "@/types/database";

type ListingStatus = Database["public"]["Enums"]["listing_status"];

export function ListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(() => {
      action().catch((err) => {
        alert(err instanceof Error ? err.message : "Greška");
      });
    });
  }

  const btn =
    "rounded border px-2 py-1 text-xs disabled:opacity-50";

  return (
    <div className="flex flex-wrap gap-1">
      {status === "active" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => refreshListingPriceAction(listingId))}
            className={`${btn} border-teal-200 text-teal-700 hover:bg-teal-50`}
          >
            Obnovi cijenu
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => hideListingAction(listingId))}
            className={`${btn} border-zinc-200 text-zinc-600 hover:bg-zinc-50`}
          >
            Sakrij
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => finishListingAction(listingId))}
            className={`${btn} border-red-200 text-red-600 hover:bg-red-50`}
          >
            Završi
          </button>
        </>
      )}

      {status === "hidden" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => unhideListingAction(listingId))}
          className={`${btn} border-teal-200 text-teal-700 hover:bg-teal-50`}
        >
          Vrati
        </button>
      )}

      {(status === "failed" || status === "draft") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => refreshListingPriceAction(listingId))}
          className={`${btn} border-teal-200 text-teal-700 hover:bg-teal-50`}
        >
          Obnovi cijenu
        </button>
      )}
    </div>
  );
}
