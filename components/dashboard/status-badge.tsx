import type { Database } from "@/types/database";

type ListingStatus = Database["public"]["Enums"]["listing_status"];

const config: Record<
  ListingStatus,
  { label: string; className: string }
> = {
  active: { label: "Aktivan", className: "bg-emerald-50 text-emerald-700" },
  hidden: { label: "Sakriven", className: "bg-zinc-100 text-zinc-600" },
  draft: { label: "Draft", className: "bg-blue-50 text-blue-700" },
  pending: { label: "Na čekanju", className: "bg-amber-50 text-amber-700" },
  failed: { label: "Greška", className: "bg-red-50 text-red-700" },
  finished: { label: "Završen", className: "bg-zinc-100 text-zinc-500" },
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const c = config[status] ?? config.pending;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}
