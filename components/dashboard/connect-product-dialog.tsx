"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  connectUnmappedListingAction,
  searchFeedProductsAction,
} from "@/lib/dashboard/actions";
import type { ProductSearchHit } from "@/lib/dashboard/queries";

export function ConnectProductDialog({
  unmappedId,
  listingTitle,
  onClose,
}: {
  unmappedId: string;
  listingTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(listingTitle.slice(0, 60));
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchFeedProductsAction(q)
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Pretraga nije uspjela");
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function connect(productId: string) {
    setError(null);
    startTransition(() => {
      connectUnmappedListingAction(unmappedId, productId)
        .then(() => {
          router.refresh();
          onClose();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Povezivanje nije uspjelo");
        });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-dialog-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2
            id="connect-dialog-title"
            className="text-base font-semibold text-zinc-900"
          >
            Poveži sa feed artiklom
          </h2>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
            OLX: {listingTitle}
          </p>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pretraga feed artikala…"
            autoFocus
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          {searching && (
            <p className="text-xs text-zinc-500">Pretraga…</p>
          )}

          {!searching && hits.length === 0 && query.trim().length >= 2 && (
            <p className="text-xs text-zinc-500">Nema rezultata.</p>
          )}

          <ul className="space-y-2">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => connect(hit.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-2 text-left hover:bg-zinc-50 disabled:opacity-50"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
                    {hit.mainImageUrl ? (
                      <Image
                        src={hit.mainImageUrl}
                        alt=""
                        fill
                        className="object-contain p-0.5"
                        sizes="48px"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-900">
                      {hit.title}
                    </p>
                    {hit.categorySlug && (
                      <p className="text-xs text-zinc-500">{hit.categorySlug}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Otkaži
          </button>
        </div>
      </div>
    </div>
  );
}
