import { fnv1a, sortByProfileOrder } from "@/lib/workers/profile-shuffle";

export type DescriptionShape = {
  separator: "newline" | "blank" | "prefix";
  prefix: "- " | "• " | "* ";
  pairFormat: "colon" | "dash" | "eq" | "colonCap";
};

export function getDescriptionShape(profileId: string): DescriptionShape {
  const h = fnv1a(`desc-shape:${profileId}`);
  const seps = ["newline", "blank", "prefix"] as const;
  const prefixes = ["- ", "• ", "* "] as const;
  const formats = ["colon", "dash", "eq", "colonCap"] as const;
  return {
    separator: seps[h % 3]!,
    prefix: prefixes[(h >>> 4) % 3]!,
    pairFormat: formats[(h >>> 8) % 4]!,
  };
}

function formatKey(key: string, format: DescriptionShape["pairFormat"]): string {
  if (format !== "colonCap" || key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function pairJoiner(format: DescriptionShape["pairFormat"]): string {
  if (format === "dash") return " - ";
  if (format === "eq") return " = ";
  return ": ";
}

export function renderSpecsBlock(
  specs: Record<string, unknown>,
  profileId: string,
): string {
  const shape = getDescriptionShape(profileId);
  const entries = Object.entries(specs).filter(
    ([, v]) => v != null && String(v).trim() !== "",
  );
  sortByProfileOrder(entries, profileId, ([k]) => k);

  const lines = entries.map(([k, v]) => {
    const line = `${formatKey(k, shape.pairFormat)}${pairJoiner(shape.pairFormat)}${v}`;
    return shape.separator === "prefix" ? `${shape.prefix}${line}` : line;
  });

  const joiner = shape.separator === "blank" ? "\n\n" : "\n";
  return lines.join(joiner);
}
