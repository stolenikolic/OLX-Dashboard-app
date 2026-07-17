import type { SupabaseClient } from "@supabase/supabase-js";

import { importListingsFromOlx } from "@/lib/listings/import-from-olx";
import { postProductListing } from "@/lib/listings/post-listing";
import {
  countPostedToday,
  findCandidateProductIds,
  getPostingCategoryQueue,
  loadListedProductIds,
  randomDelayMs,
  sleep,
} from "@/lib/listings/post-queue";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { OlxClient } from "@/lib/olx/client";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type PostWorkerOptions = {
  profileId: string;
  maxPosts?: number;
  skipImport?: boolean;
  dryRun?: boolean;
  postDelayMinMs?: number;
  postDelayMaxMs?: number;
  jobRunId?: string;
};

export type PostWorkerResult = {
  importResult: Awaited<ReturnType<typeof importListingsFromOlx>> | null;
  posted: number;
  skipped: number;
  failed: number;
  remainingDaily: number;
  errors: string[];
};

function resolveMaxPosts(explicit?: number): number {
  if (explicit != null) return explicit;
  const fromEnv = process.env.POST_LISTINGS_MAX_PER_RUN;
  if (fromEnv != null && fromEnv !== "") return Math.max(0, Number(fromEnv));
  return 5;
}

async function logItem(
  admin: Admin,
  jobRunId: string | undefined,
  level: "info" | "warn" | "error",
  message: string,
  context?: Json,
): Promise<void> {
  if (!jobRunId) return;
  await appendJobLog(admin, jobRunId, { level, message, context });
}

export async function runPostListingsWorker(
  admin: Admin,
  options: PostWorkerOptions,
): Promise<PostWorkerResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error(`Profil "${profile.name}" nema olx_username.`);
  }

  const maxPosts = resolveMaxPosts(options.maxPosts);
  const dryRun = options.dryRun ?? false;
  const postDelayMinMs = options.postDelayMinMs ?? 2000;
  const postDelayMaxMs = options.postDelayMaxMs ?? 5000;
  const jobRunId = options.jobRunId;

  let client: OlxClient | null = null;
  if (!dryRun || !options.skipImport) {
    client = await createClientForProfile(admin, profile);
  }

  let importResult: PostWorkerResult["importResult"] = null;
  if (!options.skipImport && client) {
    console.log(`Import postojećih OLX oglasa za ${username}…`);
    try {
      importResult = await importListingsFromOlx(
        admin,
        client,
        profile.id,
        username,
      );
      console.log(
        `Import završen: OLX=${importResult.olxTotal}, matched=${importResult.matched}, novi=${importResult.inserted}, preskočeno=${importResult.skipped}`,
      );
      await logItem(admin, jobRunId, "info", "Import sa OLX-a završen", {
        ...importResult,
      } as unknown as Json);
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      await logItem(admin, jobRunId, "warn", "Import sa OLX-a neuspješan", {
        error: message,
      });
      console.warn(`Import preskočen zbog greške: ${message}`);
    }
  }

  const postedToday = await countPostedToday(admin, profile.id);
  const dailyLimit = profile.daily_post_limit;
  const dailyRemaining = Math.max(0, dailyLimit - postedToday);
  const budget = Math.min(maxPosts, dailyRemaining);

  const result: PostWorkerResult = {
    importResult,
    posted: 0,
    skipped: 0,
    failed: 0,
    remainingDaily: dailyRemaining,
    errors: [],
  };

  if (budget <= 0) {
    console.log(
      `Dnevni limit iskorišten (${postedToday}/${dailyLimit}). Nema novih postova.`,
    );
    return result;
  }

  if (dryRun) {
    console.log(`DRY RUN — budget=${budget} novih oglasa (ne šalje se na OLX).`);
  }

  const listedIds = await loadListedProductIds(admin, profile.id);
  const categories = await getPostingCategoryQueue(admin, profile.id);

  if (categories.length === 0) {
    console.log("Nema mapiranih kategorija za postavljanje.");
    return result;
  }

  let remaining = budget;

  for (const category of categories) {
    if (remaining <= 0) break;

    const candidateIds = await findCandidateProductIds(
      admin,
      profile.id,
      category.categoryId,
      listedIds,
      remaining,
    );

    if (candidateIds.length === 0) {
      console.log(`Kategorija ${category.slug}: nema novih kandidata.`);
      continue;
    }

    console.log(
      `Kategorija ${category.slug}: ${candidateIds.length} kandidata (limit run-a: ${remaining}).`,
    );

    for (const productId of candidateIds) {
      if (remaining <= 0) break;

      try {
        if (dryRun) {
          const preview = await postProductListing(admin, {
            profileId: profile.id,
            productId,
            client: client!,
            dryRun: true,
          });
          if (preview.ok && preview.dryRun) {
            console.log(
              `[dry-run] ${preview.payload.title} — ${preview.price} KM`,
            );
            await logItem(admin, jobRunId, "info", "Dry-run post", {
              productId,
              title: preview.payload.title,
              price: preview.price,
            });
            result.posted++;
            listedIds.add(productId);
            remaining--;
          } else {
            result.skipped++;
          }
          continue;
        }

        const posted = await postProductListing(admin, {
          profileId: profile.id,
          productId,
          client: client!,
        });

        if (!posted.ok || posted.dryRun) {
          result.skipped++;
          if (posted.ok && posted.dryRun) {
            listedIds.add(productId);
          }
          continue;
        }

        result.posted++;
        listedIds.add(productId);
        remaining--;
        console.log(
          `Objavljeno OLX #${posted.olxListingId} (${result.posted}/${budget})`,
        );
        await logItem(admin, jobRunId, "info", "Oglas objavljen", {
          productId,
          olxListingId: posted.olxListingId,
          price: posted.price,
        });

        if (remaining > 0) {
          await sleep(randomDelayMs(postDelayMinMs, postDelayMaxMs));
        }
      } catch (err) {
        if (isAuthFailure(err)) {
          await handleOlxAuthFailure(admin, profile.id, profile.name, err);
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        result.failed++;
        result.errors.push(`${productId}: ${message}`);
        console.error(`Greška za proizvod ${productId}: ${message}`);
        await logItem(admin, jobRunId, "error", "Greška pri postu", {
          productId,
          error: message,
        });
      }
    }
  }

  return result;
}

export async function runPostListingsJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean; skipImport?: boolean },
): Promise<PostWorkerResult> {
  const profile = await loadProfileForWorker(admin, profileId).catch((err) => {
    throw err;
  });

  const jobRunId = await startJobRun(admin, {
    job: "post_listings",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runPostListingsWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      skipImport: options?.skipImport,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary = `Import matched=${stats.importResult?.matched ?? 0}; objavljeno=${stats.posted}; preskočeno=${stats.skipped}; greške=${stats.failed}.`;

    const status =
      stats.failed > 0 && stats.posted === 0
        ? "failed"
        : stats.failed > 0
          ? "partial"
          : "success";

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.posted + stats.skipped + stats.failed,
      items_succeeded: stats.posted,
      items_failed: stats.failed,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: stats.failed > 0 ? "warn" : "info",
      message: "post_listings završen",
      context: { ...stats, durationMs } as unknown as Json,
    });

    if (status === "failed") {
      await notifyJobFailed("post_listings", profile.name, summary);
    }

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });

    await appendJobLog(admin, jobRunId, {
      level: "error",
      message: "post_listings neuspješan",
      context: { error: message },
    });

    await notifyJobFailed("post_listings", profile.name, message);

    throw err;
  }
}
