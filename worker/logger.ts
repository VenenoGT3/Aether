/**
 * Tiny structured, leveled logger for the worker. No dependencies.
 *
 * Output: `<iso> [worker][level] event key=val key=val`
 * Levels: debug (only when WORKER_LOG_DEBUG=true) / info / warn / error / alert.
 *
 * `alert` is the highest severity: it renders as `[worker][ALERT]` so external
 * monitoring (Datadog, Grafana, a `grep [ALERT]` cron, etc.) can pick critical
 * conditions — exhausted jobs, payout failures, pool exhaustion, provider
 * outages — straight out of stdout without any metrics backend.
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "alert";
type LogContext = Record<string, unknown>;

const DEBUG = (process.env.WORKER_LOG_DEBUG ?? "").trim().toLowerCase() === "true";

function format(level: LogLevel, event: string, ctx?: LogContext): string {
  let suffix = "";
  if (ctx) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(ctx)) {
      if (v === undefined) continue;
      parts.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    if (parts.length) suffix = " " + parts.join(" ");
  }
  const tag = level === "alert" ? "ALERT" : level;
  return `${new Date().toISOString()} [worker][${tag}] ${event}${suffix}`;
}

export const log = {
  debug(event: string, ctx?: LogContext): void {
    if (DEBUG) console.log(format("debug", event, ctx));
  },
  info(event: string, ctx?: LogContext): void {
    console.log(format("info", event, ctx));
  },
  warn(event: string, ctx?: LogContext): void {
    console.warn(format("warn", event, ctx));
  },
  error(event: string, ctx?: LogContext): void {
    console.error(format("error", event, ctx));
  },
  /** Critical condition that should page/notify someone. Tagged [ALERT]. */
  alert(event: string, ctx?: LogContext): void {
    const line = format("alert", event, ctx);
    console.error(line);
    notifyAlertWebhook(line);
  },
};

/**
 * Push [ALERT] lines to ALERT_WEBHOOK_URL (Slack-compatible `{ text }` JSON)
 * so conditions like payout.transfer.unknown page someone instead of waiting
 * in stdout for a log review. Fire-and-forget: alerting must never block or
 * crash the pipeline it is reporting on.
 */
function notifyAlertWebhook(line: string): void {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: line }),
      signal: AbortSignal.timeout(5_000),
    }).catch((err) => {
      console.error(format("error", "alert.webhook_failed", { error: errMessage(err) }));
    });
  } catch (err) {
    console.error(format("error", "alert.webhook_failed", { error: errMessage(err) }));
  }
}

/** Normalize an unknown thrown value into a message string. */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
