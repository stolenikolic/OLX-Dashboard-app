"use client";

import { useState, useTransition } from "react";

import { updateProfileSettingsAction } from "@/lib/dashboard/actions";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateProfileSettingsAction(profile.id, {
          name: String(fd.get("name") ?? ""),
          status: String(fd.get("status")) as Profile["status"],
          kurs: Number(fd.get("kurs")),
          kurs_uvoz: Number(fd.get("kurs_uvoz")),
          daily_post_limit: Number(fd.get("daily_post_limit")),
          price_mode: String(fd.get("price_mode")) as Profile["price_mode"],
          description_template: String(fd.get("description_template") ?? ""),
          auth_method: String(fd.get("auth_method")) as Profile["auth_method"],
          olx_username: String(fd.get("olx_username") ?? ""),
          olx_login_email: String(fd.get("olx_login_email") ?? ""),
          olx_password_enc: String(fd.get("olx_password_enc") ?? ""),
          olx_client_id: String(fd.get("olx_client_id") ?? ""),
          olx_client_token_enc: String(fd.get("olx_client_token_enc") ?? ""),
          proxy_url: String(fd.get("proxy_url") ?? ""),
        });
        setMessage("Sačuvano.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Greška");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Osnovno</h2>
        <label className="block text-sm">
          Naziv
          <input
            name="name"
            defaultValue={profile.name}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          Status
          <select
            name="status"
            defaultValue={profile.status}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="active">Aktivan</option>
            <option value="paused">Pauziran</option>
            <option value="suspended">Suspendovan</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Kurs
            <input
              name="kurs"
              type="number"
              step="0.0001"
              defaultValue={profile.kurs}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Kurs uvoz
            <input
              name="kurs_uvoz"
              type="number"
              step="0.0001"
              defaultValue={profile.kurs_uvoz}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Dnevni limit
            <input
              name="daily_post_limit"
              type="number"
              defaultValue={profile.daily_post_limit}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm">
          Režim obnavljanja cijena
          <select
            name="price_mode"
            defaultValue={profile.price_mode ?? "original"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="original">Originalne cijene (formula + doplata)</option>
            <option value="competitor_minus_1">
              Cijena minus 1 (Suboticani − 1 KM, min. 8% marža)
            </option>
          </select>
        </label>
        <label className="block text-sm">
          Šablon opisa
          <textarea
            name="description_template"
            rows={4}
            defaultValue={profile.description_template ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">OLX kredencijali</h2>
        <label className="block text-sm">
          Auth metoda
          <select
            name="auth_method"
            defaultValue={profile.auth_method}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="login">Login (email/lozinka)</option>
            <option value="client_token">Client token</option>
          </select>
        </label>
        <label className="block text-sm">
          OLX username
          <input
            name="olx_username"
            defaultValue={profile.olx_username ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Login email
          <input
            name="olx_login_email"
            defaultValue={profile.olx_login_email ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Lozinka (ostavi prazno da zadržiš)
          <input
            name="olx_password_enc"
            type="password"
            placeholder="••••••"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Client ID
          <input
            name="olx_client_id"
            defaultValue={profile.olx_client_id ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Client token (ostavi prazno da zadržiš)
          <input
            name="olx_client_token_enc"
            type="password"
            placeholder="••••••"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Proxy URL
          <input
            name="proxy_url"
            defaultValue={profile.proxy_url ?? ""}
            placeholder="http://user:pass@host:port"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        Sačuvaj
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </form>
  );
}
