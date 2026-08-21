import sharp from "sharp";

import { fnv1a } from "@/lib/workers/profile-shuffle";

const TARGET_WIDTHS = [1180, 1240, 1320] as const;

function asymmetricCrop(
  h: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  if (width < 80 || height < 80) {
    return { left: 0, top: 0, width, height };
  }

  const totalX = 0.03 + (h % 3) * 0.01;
  const leftFrac = 0.2 + ((h >>> 4) % 7) * 0.08;
  const left = Math.round(width * totalX * leftFrac);
  const right = Math.round(width * totalX * (1 - leftFrac));

  const totalY = 0.03 + ((h >>> 8) % 3) * 0.01;
  const topFrac = 0.2 + ((h >>> 12) % 7) * 0.08;
  const top = Math.round(height * totalY * topFrac);
  const bottom = Math.round(height * totalY * (1 - topFrac));

  const extractWidth = Math.max(1, width - left - right);
  const extractHeight = Math.max(1, height - top - bottom);
  return { left, top, width: extractWidth, height: extractHeight };
}

/** Minimalna per-profil transformacija — mijenja i MD5 i pHash. */
export async function transformForProfile(
  input: Buffer,
  profileId: string,
): Promise<Buffer> {
  const h = fnv1a(`img:${profileId}`);
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const crop = asymmetricCrop(h, width, height);
  const targetWidth = TARGET_WIDTHS[h % TARGET_WIDTHS.length]!;
  const quality = 82 + (h % 10);

  return sharp(input)
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
