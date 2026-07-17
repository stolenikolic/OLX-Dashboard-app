import { CategoryMarginsForm } from "@/components/dashboard/category-margins-form";
import { requireAdmin } from "@/lib/auth/dal";
import { fetchCategories } from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const categories = await fetchCategories(supabase);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Admin — kategorije</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Globalne marže i uvoz-flag po kategoriji.
        </p>
      </div>
      <CategoryMarginsForm
        categories={categories.map((c) => ({
          id: c.id,
          internal_slug: c.internal_slug,
          internal_name: c.internal_name,
          marza_huf: Number(c.marza_huf),
          marza_bih: Number(c.marza_bih),
          import_flag: c.import_flag,
        }))}
      />
    </div>
  );
}
