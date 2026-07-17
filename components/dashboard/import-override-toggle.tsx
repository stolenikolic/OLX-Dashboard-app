"use client";

import { useTransition } from "react";

import { setProductImportOverrideAction } from "@/lib/dashboard/actions";
import type { Database } from "@/types/database";

type ImportOverride = Database["public"]["Enums"]["import_override"];

const labels: Record<ImportOverride, string> = {
  inherit: "Naslijedi",
  on: "Uvoz",
  off: "Standard",
};

export function ImportOverrideToggle({
  productId,
  value,
}: {
  productId: string;
  value: ImportOverride | null;
}) {
  const [pending, startTransition] = useTransition();
  const current = value ?? "inherit";

  return (
    <select
      disabled={pending}
      value={current}
      onChange={(e) => {
        const next = e.target.value as ImportOverride;
        startTransition(() => {
          setProductImportOverrideAction(productId, next).catch((err) => {
            alert(err instanceof Error ? err.message : "Greška");
          });
        });
      }}
      className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600"
      title="Uvoz flag po artiklu"
    >
      {(Object.keys(labels) as ImportOverride[]).map((k) => (
        <option key={k} value={k}>
          {labels[k]}
        </option>
      ))}
    </select>
  );
}
