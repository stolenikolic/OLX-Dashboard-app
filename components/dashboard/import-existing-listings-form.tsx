"use client";

import { useState, useTransition } from "react";

import { importExistingListingsCsvAction } from "@/lib/dashboard/actions";
import type { ImportFromCsvResult } from "@/lib/listings/import-from-csv";

export function ImportExistingListingsForm({ profileId }: { profileId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportFromCsvResult | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const res = await importExistingListingsCsvAction(profileId, fd);
        setResult(res);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Greška pri importu");
      }
    });
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="font-semibold">Mapiranje postojećih oglasa</h2>
        <p className="mt-1 text-sm text-zinc-600">
          CSV sa kolonama <code className="text-xs">product_id,olx_id</code>{" "}
          (feed UUID → OLX listing ID). Popunjava dedup vezu da automatika ne
          postavlja duplikate. Prazan product_id se preskače.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          CSV fajl
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            disabled={pending}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? "Uvoz u toku…" : "Uvezi mapiranje"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-3">
          <Stat label="Redova u CSV" value={result.totalRows} />
          <Stat label="Jedinstvenih veza" value={result.pairs} />
          <Stat label="Ubačeno" value={result.inserted} />
          <Stat label="Ažurirano" value={result.updated} />
          <Stat label="Već mapirano" value={result.skippedAlreadyMapped} />
          <Stat label="Prazan feed ID" value={result.skippedEmptyFeed} />
          <Stat label="Nepoznat feed" value={result.skippedUnknownFeed} />
          <Stat label="Nije na OLX profilu" value={result.skippedNotOnOlx} />
          <Stat label="Neispravan red" value={result.skippedInvalid} />
          <Stat label="Obrisani konflikti" value={result.deletedConflicts} />
        </dl>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value}</dd>
    </div>
  );
}
