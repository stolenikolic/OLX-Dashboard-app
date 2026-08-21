import { renderSpecsBlock } from "@/lib/listings/description-shape";

const DEFAULT_TEMPLATE = `{{title}}

{{specs}}`;

export function renderDescription(
  template: string | null | undefined,
  title: string,
  specs: Record<string, unknown>,
  profileId: string,
): string {
  const specLines = renderSpecsBlock(specs, profileId);
  const tpl = template?.trim() || DEFAULT_TEMPLATE;
  return tpl
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{specs\}\}/g, specLines)
    .trim();
}
