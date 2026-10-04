import { HttpError } from "./respond";
import type { KvClient } from "./store";

/**
 * Guards read-modify-write cycles against the whole-store blob.
 *
 * The store is a single JSON document (KV key or local file). Two concurrent
 * booking requests can both read the same snapshot, both see seat `A5` as
 * Available, and both write — double-booking the seat and losing the other
 * write. An in-process queue is enough for `next dev`; the Upstash lock covers
 * the multi-instance serverless case where the queue alone is not shared.
 */

const LOCK_KEY = "cinema:lock";
const LOCK_TTL_MS = 8_000;
const ACQUIRE_TIMEOUT_MS = 6_000;
const RETRY_DELAY_MS = 40;

let localQueue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const randomToken = () => `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Serialize work within this process so concurrent requests queue up. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = localQueue.then(task, task);
  localQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function acquireRemoteLock(kv: KvClient): Promise<(() => Promise<void>) | null> {
  const token = randomToken();
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const acquired = await kv.set(LOCK_KEY, token, { nx: true, px: LOCK_TTL_MS });
    if (acquired) {
      return async () => {
        // Only release a lock we still own. If the TTL lapsed and another writer
        // took over, deleting their lock would be worse than letting it expire.
        const current = await kv.get<string>(LOCK_KEY);
        if (current === token) await kv.del(LOCK_KEY);
      };
    }
    await sleep(RETRY_DELAY_MS);
  }
  return null;
}

/**
 * Runs `task` while holding the store lock.
 *
 * If the remote lock cannot be taken within the timeout the task does NOT run:
 * proceeding unlocked is exactly the double-booking race the lock exists to
 * prevent. Callers get a 503 and the customer is asked to retry, which is far
 * cheaper than selling one seat twice.
 */
export async function withStoreLock<T>(kv: KvClient | null, task: () => Promise<T>): Promise<T> {
  return enqueue(async () => {
    if (!kv) return task();
    const release = await acquireRemoteLock(kv);
    if (!release) {
      throw new HttpError(503, "Our booking system is busy handling other checkouts. Please try again in a moment.", {
        "Retry-After": "5"
      });
    }
    try {
      return await task();
    } finally {
      await release().catch(() => undefined);
    }
  });
}