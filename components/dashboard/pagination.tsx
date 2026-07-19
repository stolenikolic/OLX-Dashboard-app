import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {prev ? (
        <Link
          href={hrefForPage(prev)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          ← Prethodna
        </Link>
      ) : (
        <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300">
          ← Prethodna
        </span>
      )}

      <span className="px-2 text-sm text-zinc-600">
        Stranica {page} / {totalPages}
      </span>

      {next ? (
        <Link
          href={hrefForPage(next)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Sljedeća →
        </Link>
      ) : (
        <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-sm text-zinc-300">
          Sljedeća →
        </span>
      )}
    </nav>
  );
}
