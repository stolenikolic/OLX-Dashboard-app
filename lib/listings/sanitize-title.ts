const BOSNIAN_CHARS = "čćšžđČĆŠŽĐ";

const CHAR_REPLACEMENTS: Record<string, string> = {
  "×": "x",
  "✕": "x",
  "✖": "x",
  "–": "-",
  "—": "-",
  "−": "-",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u00AB": '"',
  "\u00BB": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "`": "'",
  "…": "...",
  "®": "",
  "™": "",
  "©": "",
  "µ": "u",
  "°": " ",
  "Ø": "O",
  "ø": "o",
  "ß": "ss",
  "\u00A0": " ",
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
};

/** OLX prihvata latinicu + afrikate (č, ć, š, ž, đ). Uklanja mađarske/nordijske znakove (ő, ü, Ø…). */
export function sanitizeOlxTitle(title: string): string {
  let t = title.trim();

  for (const [from, to] of Object.entries(CHAR_REPLACEMENTS)) {
    t = t.split(from).join(to);
  }

  const placeholders: string[] = [];
  for (const ch of BOSNIAN_CHARS) {
    const idx = placeholders.length;
    placeholders.push(ch);
    t = t.split(ch).join(`\x00BOS${idx}\x00`);
  }

  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  placeholders.forEach((ch, idx) => {
    t = t.split(`\x00BOS${idx}\x00`).join(ch);
  });

  t = t.replace(/[^a-zA-Z0-9čćšžđČĆŠŽĐ\s\-.,+()/\\'"&%#@!?=:|<]/g, "");
  t = t.replace(/([!?.,\-=+#%&@*_><:()|\\|])\1{3,}/g, "$1$1$1");
  t = t.replace(/\s+/g, " ").trim();

  return t;
}
