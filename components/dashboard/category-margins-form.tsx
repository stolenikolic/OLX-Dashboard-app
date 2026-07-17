"use client";

import { useTransition } from "react";

import { updateCategoryMarginsAction } from "@/lib/dashboard/actions";

type Category = {
  id: string;
  internal_slug: string;
  internal_name: string;
  marza_huf: number;
  marza_bih: number;
  import_flag: boolean;
};

function CategoryRow({ category }: { category: Category }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateCategoryMarginsAction(category.id, {
        marza_huf: Number(fd.get("marza_huf")),
        marza_bih: Number(fd.get("marza_bih")),
        import_flag: fd.get("import_flag") === "on",
      });
    });
  }

  return (
    <tr className="border-t border-zinc-100">
      <td className="px-4 py-2">
        <span className="font-medium">{category.internal_name}</span>
        <span className="ml-2 text-xs text-zinc-400">{category.internal_slug}</span>
      </td>
      <td className="px-4 py-2" colSpan={4}>
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-zinc-500">
            HUF
            <input
              name="marza_huf"
              type="number"
              step="0.001"
              defaultValue={category.marza_huf}
              className="ml-1 w-24 rounded border px-2 py-1"
            />
          </label>
          <label className="text-xs text-zinc-500">
            BiH
            <input
              name="marza_bih"
              type="number"
              step="0.001"
              defaultValue={category.marza_bih}
              className="ml-1 w-24 rounded border px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input name="import_flag" type="checkbox" defaultChecked={category.import_flag} />
            Uvoz
          </label>
          <button
            type="submit"
            disabled={pending}
            className="text-xs text-teal-600 hover:underline disabled:opacity-50"
          >
            Sačuvaj
          </button>
        </form>
      </td>
    </tr>
  );
}

export function CategoryMarginsForm({ categories }: { categories: Category[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-zinc-500">
          <tr>
            <th className="px-4 py-2">Kategorija</th>
            <th className="px-4 py-2" colSpan={4}>
              Marže i uvoz
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <CategoryRow key={cat.id} category={cat} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
