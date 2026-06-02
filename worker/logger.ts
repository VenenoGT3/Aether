/**
 * Tiny structured, leveled logger for the worker. No dependencies.
 *
 * Output: `<iso> [worker][level] event key=val key=val`
 * Levels: debug (only when WORKER_LOG_DEBUG=true) / info / warn / error.
 * Keeps logs greppable and context-rich without pulling in a logging library.
 */

type LogLevel = "debug" | "info" | "warn" | "error";
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
  return `${new Date().toISOString()} [worker][${level}] ${event}${suffix}`;
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
};

/** Normalize an unknown thrown value into a message string. */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
