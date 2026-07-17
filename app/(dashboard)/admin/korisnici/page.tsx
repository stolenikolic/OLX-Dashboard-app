import { AdminUsersPanel } from "@/components/dashboard/admin-users-panel";
import { requireAdmin } from "@/lib/auth/dal";
import { fetchProfileSummaries } from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const profiles = await fetchProfileSummaries(supabase);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Admin — korisnici</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Kreiranje radničkih naloga i test profila.
        </p>
      </div>
      <AdminUsersPanel profiles={profiles.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
