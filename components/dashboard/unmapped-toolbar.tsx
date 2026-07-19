"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  deleteAllUnmappedAction,
  refreshUnmappedListingsAction,
} from "@/lib/dashboard/actions";

export function UnmappedToolbar({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      refreshUnmappedListingsAction(profileId)
        .then((result) => {
          router.refresh();
          alert(
            `Osvježeno: nemapirano=${result.unmapped} (od ${result.olxTotal} aktivnih na OLX-u).`,
          );
        })
        .catch((err) => {
          alert(err instanceof Error ? err.message : "Osvježavanje nije uspjelo");
        });
    });
  }

  function deleteAll() {
    const ok = confirm(
      "Obrisati SVE nemapirane oglase ovog profila na OLX-u?\n\nPokreće se GitHub Actions job (DELETE). Ovo se ne može poništiti.",
    );
    if (!ok) return;

    startTransition(() => {
      deleteAllUnmappedAction(profileId)
        .then((message) => {
          alert(message);
        })
        .catch((err) => {
          alert(err instanceof Error ? err.message : "Pokretanje nije uspjelo");
        });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={refresh}
        className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {pending ? "U toku…" : "Osvježi nemapirane"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={deleteAll}
        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Obriši sve
      </button>
    </div>
  );
}
