import sharp from "sharp";

import { fnv1a } from "@/lib/workers/profile-shuffle";

const TARGET_WIDTHS = [1180, 1240, 1320] as const;

/** 1 ili 2 piksela po ivici — dovoljno za hash, ne siječe kadar. */
function pixelCrop(
  h: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  if (width < 8 || height < 8) {
    return { left: 0, top: 0, width, height };
  }

  const left = 1 + (h % 2);
  const top = 1 + ((h >>> 2) % 2);
  const right = 1 + ((h >>> 4) % 2);
  const bottom = 1 + ((h >>> 6) % 2);

  return {
    left,
    top,
    width: width - left - right,
    height: height - top - bottom,
  };
}

/** Minimalna per-profil transformacija — mijenja i MD5 i pHash. */
export async function transformForProfile(
  input: Buffer,
  profileId: string,
): Promise<Buffer> {
  const h = fnv1a(`img:${profileId}`);
  // EXIF prvo, pa mjerenje — inače extract ide na krive dimenzije.
  const oriented = await sharp(input).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const crop = pixelCrop(h, width, height);
  const targetWidth = TARGET_WIDTHS[h % TARGET_WIDTHS.length]!;
  const quality = 82 + (h % 10);

  return sharp(oriented)
    .extract(crop)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
}

export function filenameForProfile(
  profileId: string,
  productId: string,
): string {
  const style = fnv1a(`img-name:${profileId}`) % 3;
  const n = fnv1a(`img-n:${profileId}:${productId}`);
  if (style === 0) {
    return `IMG_${String(1000 + (n % 9000)).padStart(4, "0")}.jpg`;
  }
  if (style === 1) {
    return `photo_${n % 10000}.jpeg`;
  }
  const month = 1 + ((n >>> 5) % 12);
  const day = 1 + (n % 28);
  const hour = n % 24;
  const min = (n >>> 8) % 60;
  const sec = n % 60;
  return `${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}_${String(hour).padStart(2, "0")}${String(min).padStart(2, "0")}${String(sec).padStart(2, "0")}.jpg`;
}

export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Skidanje slike nije uspjelo: ${res.status} ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
