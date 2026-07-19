import Image from "next/image";
import Link from "next/link";

import type { OlxShopHeaderData } from "@/lib/olx/fetch-shop-profile";

function packageBadgeClass(packageName: string): string {
  const key = packageName.toLowerCase();
  if (key.includes("platinum")) {
    return "bg-gradient-to-r from-slate-600 to-slate-800 text-white";
  }
  if (key.includes("gold")) {
    return "bg-gradient-to-r from-amber-400 to-amber-600 text-amber-950";
  }
  if (key.includes("silver")) {
    return "bg-gradient-to-r from-zinc-300 to-zinc-400 text-zinc-800";
  }
  if (key.includes("bronze")) {
    return "bg-gradient-to-r from-orange-300 to-orange-500 text-orange-950";
  }
  return "bg-teal-600 text-white";
}

export function OlxShopHeader({
  shop,
  fallbackName,
}: {
  shop: OlxShopHeaderData | null;
  fallbackName: string;
}) {
  if (!shop) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-500">
          {fallbackName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{fallbackName}</h1>
          <p className="text-sm text-zinc-500">OLX profil nije učitan</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={shop.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-2 ring-zinc-200 transition group-hover:ring-teal-400">
        {shop.avatarUrl ? (
          <Image
            src={shop.avatarUrl}
            alt={shop.username}
            fill
            className="object-cover"
            sizes="48px"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-500">
            {shop.username.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="truncate text-2xl font-bold text-zinc-900 group-hover:text-teal-700">
          {shop.username}
        </h1>
        {shop.packageName && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${packageBadgeClass(shop.packageName)}`}
          >
            {shop.packageName}
          </span>
        )}
      </div>
    </Link>
  );
}
