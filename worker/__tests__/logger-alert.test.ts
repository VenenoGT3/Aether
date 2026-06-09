import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../logger";

describe("worker logger alert webhook", () => {
  const originalUrl = process.env.ALERT_WEBHOOK_URL;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = originalUrl;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the alert line to ALERT_WEBHOOK_URL when configured", () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/alert";
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    log.alert("payout.transfer.unknown", { payoutId: "p1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example/alert");
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toContain("[worker][ALERT] payout.transfer.unknown");
    expect(body.text).toContain("payoutId=p1");
  });

  it("does nothing when no webhook is configured", () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    log.alert("payout.transfer.unknown");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives a rejecting webhook without throwing", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/alert";
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(() => log.alert("payout.transfer.unknown")).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
