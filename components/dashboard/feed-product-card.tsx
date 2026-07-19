import Image from "next/image";

import { ImportOverrideToggle } from "@/components/dashboard/import-override-toggle";
import type { FeedProductRow } from "@/lib/dashboard/queries";

export function FeedProductCard({ product }: { product: FeedProductRow }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-zinc-100">
        {product.mainImageUrl ? (
          <Image
            src={product.mainImageUrl}
            alt={product.title}
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
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900">
          {product.title}
        </h3>

        {product.categorySlug && (
          <p className="mt-1 text-xs text-zinc-500">{product.categorySlug}</p>
        )}

        <p className="mt-2 text-lg font-bold text-teal-700">
          {product.shopPrice != null ? `${product.shopPrice} KM` : "—"}
          <span className="ml-1 text-xs font-normal text-zinc-400">
            (shop)
          </span>
        </p>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Uvoz:</span>
          <ImportOverrideToggle
            productId={product.id}
            value={product.importOverride}
          />
        </div>

        <p className="mt-auto pt-3 font-mono text-[10px] text-zinc-400">
          {product.feedUuid.slice(0, 8)}…
        </p>
      </div>
    </article>
  );
}
