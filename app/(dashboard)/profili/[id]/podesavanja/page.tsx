import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form";
import { requireAdmin } from "@/lib/auth/dal";
import { fetchProfileById } from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileSettingsPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const profile = await fetchProfileById(supabase, id);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-teal-600 hover:underline">
          ← Pregled
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">
          Podešavanja — {profile.name}
        </h1>
        <div className="mt-2 flex gap-3 text-sm">
          <Link
            href={`/profili/${id}/kategorije`}
            className="text-teal-600 hover:underline"
          >
            Prioritet kategorija →
          </Link>
        </div>
      </div>
      <ProfileSettingsForm profile={profile} />
    </div>
  );
}
