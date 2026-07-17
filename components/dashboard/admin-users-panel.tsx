"use client";

import { useState, useTransition } from "react";

import {
  createTestProfileAction,
  createWorkerAccountAction,
} from "@/lib/dashboard/actions";

export function AdminUsersPanel({
  profiles,
}: {
  profiles: Array<{ id: string; name: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function createWorker(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createWorkerAccountAction({
          email: String(fd.get("email") ?? ""),
          password: String(fd.get("password") ?? ""),
          profileId: String(fd.get("profileId") ?? ""),
        });
        setMessage("Radnički nalog kreiran.");
        e.currentTarget.reset();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  function createProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const id = await createTestProfileAction({
          name: String(fd.get("name") ?? ""),
          olx_username: String(fd.get("olx_username") ?? ""),
        });
        setMessage(`Profil kreiran (${id}).`);
        e.currentTarget.reset();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Novi radnički nalog</h2>
        <form onSubmit={createWorker} className="mt-4 space-y-3">
          <input name="email" type="email" placeholder="Email" required className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input name="password" type="password" placeholder="Lozinka" required className="w-full rounded-lg border px-3 py-2 text-sm" />
          <select name="profileId" required className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">Odaberi profil</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            Kreiraj
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Novi test profil</h2>
        <form onSubmit={createProfile} className="mt-4 space-y-3">
          <input name="name" placeholder="Naziv profila" required className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input name="olx_username" placeholder="OLX username" className="w-full rounded-lg border px-3 py-2 text-sm" />
          <button type="submit" disabled={pending} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white disabled:opacity-50">
            Dodaj profil (paused)
          </button>
        </form>
      </section>

      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
