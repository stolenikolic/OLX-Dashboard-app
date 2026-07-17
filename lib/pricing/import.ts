import type { ImportOverride } from "@/lib/pricing/types";

/**
 * Rezolucija uvoz-flag-a (PRD §6.7):
 * - artikal `on`  → uvoz
 * - artikal `off` → standardno
 * - `inherit`     → kategorija.import_flag
 */
export function resolveImportMode(
  override: ImportOverride,
  categoryImportFlag: boolean,
): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return categoryImportFlag;
}
