const DEFAULT_TEMPLATE = `{{title}}

{{specs}}

TechZone — garancija i brza isporuka.`;

export function renderDescription(
  template: string | null | undefined,
  title: string,
  specs: Record<string, unknown>,
): string {
  const specLines = Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const tpl = template?.trim() || DEFAULT_TEMPLATE;
  return tpl
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{specs\}\}/g, specLines)
    .trim();
}
