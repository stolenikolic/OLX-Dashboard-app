const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CsvMappingPair = {
  feedUuid: string;
  olxListingId: number;
};

export type ParseMappingCsvResult = {
  /** Finalne veze nakon last-wins (feed i olx jedinstveni). */
  pairs: CsvMappingPair[];
  totalRows: number;
  skippedEmptyFeed: number;
  skippedInvalid: number;
};

function detectSeparator(line: string): "," | ";" {
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line: string, sep: "," | ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function isHeaderRow(cols: string[]): boolean {
  if (cols.length < 2) return false;
  const a = cols[0].toLowerCase();
  const b = cols[1].toLowerCase();
  const feedLike = /^(product_id|feed_id|feed_uuid|uuid|id)$/.test(a);
  const olxLike = /^(olx_id|olx_listing_id|listing_id)$/.test(b);
  return feedLike || olxLike;
}

/**
 * Parsira CSV: product_id (feed uuid), olx_id.
 * Header opcionalan. Prazan feed → skip. Duplikati → last wins.
 */
export function parseMappingCsv(text: string): ParseMappingCsvResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      pairs: [],
      totalRows: 0,
      skippedEmptyFeed: 0,
      skippedInvalid: 0,
    };
  }

  const sep = detectSeparator(lines[0]);
  let start = 0;
  const firstCols = splitCsvLine(lines[0], sep);
  if (isHeaderRow(firstCols)) start = 1;

  const feedToOlx = new Map<string, number>();
  const olxToFeed = new Map<number, string>();
  let skippedEmptyFeed = 0;
  let skippedInvalid = 0;
  let totalRows = 0;

  for (let i = start; i < lines.length; i++) {
    totalRows++;
    const cols = splitCsvLine(lines[i], sep);
    const feedRaw = (cols[0] ?? "").trim();
    const olxRaw = (cols[1] ?? "").trim();

    if (!feedRaw) {
      skippedEmptyFeed++;
      continue;
    }

    if (!UUID_RE.test(feedRaw)) {
      skippedInvalid++;
      continue;
    }

    const olxListingId = Number(olxRaw);
    if (!Number.isFinite(olxListingId) || olxListingId <= 0) {
      skippedInvalid++;
      continue;
    }

    const prevOlx = feedToOlx.get(feedRaw);
    if (prevOlx != null) {
      olxToFeed.delete(prevOlx);
    }
    const prevFeed = olxToFeed.get(olxListingId);
    if (prevFeed != null) {
      feedToOlx.delete(prevFeed);
    }

    feedToOlx.set(feedRaw, olxListingId);
    olxToFeed.set(olxListingId, feedRaw);
  }

  const pairs: CsvMappingPair[] = [];
  for (const [feedUuid, olxListingId] of feedToOlx) {
    pairs.push({ feedUuid, olxListingId });
  }

  return {
    pairs,
    totalRows,
    skippedEmptyFeed,
    skippedInvalid,
  };
}
