import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryPriorityForm } from "@/components/dashboard/category-priority-form";
import { requireAdmin } from "@/lib/auth/dal";
import {
  fetchCategories,
  fetchProfileById,
  fetchProfileCategoryPriority,
} from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileCategoriesPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [profile, categories, priority] = await Promise.all([
    fetchProfileById(supabase, id),
    fetchCategories(supabase),
    fetchProfileCategoryPriority(supabase, id),
  ]);

  if (!profile) notFound();

  const existing = priority.map((row) => ({
    category_id: row.category_id,
    priority: row.priority,
    enabled: row.enabled,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-teal-600 hover:underline">
          ← Pregled
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">
          Prioritet kategorija — {profile.name}
        </h1>
      </div>
      <CategoryPriorityForm
        profileId={id}
        categories={categories.map((c) => ({
          id: c.id,
          internal_slug: c.internal_slug,
          internal_name: c.internal_name,
          olx_category_id: c.olx_category_id,
        }))}
        existing={existing}
      />
    </div>
  );
}
