"use client";

import { useTransition } from "react";

import { setSelectedProfileAction } from "@/lib/dashboard/actions";

type ProfileOption = { id: string; name: string };

export function ProfileSwitcher({
  profiles,
  selectedId,
}: {
  profiles: ProfileOption[];
  selectedId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (profiles.length <= 1) return null;

  return (
    <select
      disabled={pending}
      value={selectedId ?? ""}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => {
          setSelectedProfileAction(value).catch(console.error);
        });
      }}
      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700"
    >
      <option value="">Svi profili</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
