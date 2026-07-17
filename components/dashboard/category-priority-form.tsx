"use client";

import { useState, useTransition } from "react";

import { updateCategoryPriorityAction } from "@/lib/dashboard/actions";

type CategoryRow = {
  id: string;
  internal_slug: string;
  internal_name: string;
  olx_category_id: number | null;
};

type PriorityRow = {
  category_id: string;
  priority: number;
  enabled: boolean;
};

export function CategoryPriorityForm({
  profileId,
  categories,
  existing,
}: {
  profileId: string;
  categories: CategoryRow[];
  existing: PriorityRow[];
}) {
  const existingMap = new Map(existing.map((e) => [e.category_id, e]));
  const [rows, setRows] = useState(
    categories.map((cat, index) => {
      const ex = existingMap.get(cat.id);
      return {
        categoryId: cat.id,
        slug: cat.internal_slug,
        name: cat.internal_name,
        mapped: cat.olx_category_id != null,
        priority: ex?.priority ?? index,
        enabled: ex?.enabled ?? cat.olx_category_id != null,
      };
    }),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      try {
        await updateCategoryPriorityAction(
          profileId,
          rows.map((r) => ({
            categoryId: r.categoryId,
            priority: r.priority,
            enabled: r.enabled,
          })),
        );
        setMessage("Sačuvano.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-2">Kategorija</th>
              <th className="px-4 py-2">Prioritet</th>
              <th className="px-4 py-2">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.categoryId} className="border-t border-zinc-100">
                <td className="px-4 py-2">
                  <span className="font-medium">{row.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">{row.slug}</span>
                  {!row.mapped && (
                    <span className="ml-2 text-xs text-amber-600">nemapirano</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={row.priority}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...row, priority: Number(e.target.value) };
                      setRows(next);
                    }}
                    className="w-20 rounded border px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...row, enabled: e.target.checked };
                      setRows(next);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        Sačuvaj prioritet
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
