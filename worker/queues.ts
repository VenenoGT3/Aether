import { Queue, type ConnectionOptions } from "bullmq";
import { getRedisUrl } from "./env";
import { QUEUE_NAMES } from "./types";

/**
 * Build BullMQ connection options from REDIS_URL. We pass plain options (not an
 * IORedis instance) so BullMQ uses its own bundled ioredis — this avoids the
 * dual-ioredis type clash and keeps a single Redis client implementation.
 * BullMQ requires maxRetriesPerRequest: null.
 */
function buildConnection(): ConnectionOptions {
  const u = new URL(getRedisUrl());
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export const connection: ConnectionOptions = buildConnection();

export const viewSyncQueue = new Queue(QUEUE_NAMES.viewSync, { connection });
export const earningsCalcQueue = new Queue(QUEUE_NAMES.earningsCalc, {
  connection,
});
export const payoutBatchQueue = new Queue(QUEUE_NAMES.payoutBatch, {
  connection,
});

export async function closeQueues(): Promise<void> {
  await Promise.all([
    viewSyncQueue.close(),
    earningsCalcQueue.close(),
    payoutBatchQueue.close(),
  ]);
}
