import { fnv1a } from "@/lib/workers/profile-shuffle";

/** OLX/Elasticsearch max_result_window — page * per_page ne smije preći ovo, po upitu. */
export const ES_WINDOW = 10_000;

/**
 * Isključivo djelitelji ES_WINDOW-a. Time perPage * maxPage ostaje UVIJEK
 * tačno 10.000 — obuhvat po upitu je identičan bez obzira na izbor, mijenja
 * se samo broj HTTP zahtjeva potrebnih da se taj obuhvat pokrije.
 */
const PER_PAGE_OPTIONS = [1000, 500, 250, 200] as const;

export type PaginationPlan = {
  perPage: number;
  /** Maksimalan broj stranica da se pokrije ES_WINDOW rezultata unutar jednog upita/bucketa. */
  maxPage: number;
};

function planFor(perPage: number): PaginationPlan {
  return { perPage, maxPage: ES_WINDOW / perPage };
}

/**
 * Deterministički per-profil izbor per_page — čisto anti-detekcijska mjera.
 * Isti profil uvijek dobija isti plan (stabilno kroz runove).
 */
export function paginationForProfile(profileId: string): PaginationPlan {
  const perPage =
    PER_PAGE_OPTIONS[fnv1a(`per-page:${profileId}`) % PER_PAGE_OPTIONS.length]!;
  return planFor(perPage);
}

/** Random per_page za globalne (ne-profilne) jobove — npr. competitor sync po run-u. */
export function paginationForRun(): PaginationPlan {
  const perPage =
    PER_PAGE_OPTIONS[Math.floor(Math.random() * PER_PAGE_OPTIONS.length)]!;
  return planFor(perPage);
}
