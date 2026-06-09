import { afterEach, describe, expect, it } from "vitest";
import { betaPlatformsLabel, getBetaPlatforms, isPlatformInBeta } from "@/lib/beta";

describe("beta platform config", () => {
  const original = process.env.BETA_PLATFORMS;

  afterEach(() => {
    if (original === undefined) delete process.env.BETA_PLATFORMS;
    else process.env.BETA_PLATFORMS = original;
  });

  it("defaults to the YouTube-only beta", () => {
    delete process.env.BETA_PLATFORMS;
    expect(getBetaPlatforms()).toEqual(["youtube"]);
    expect(isPlatformInBeta("youtube")).toBe(true);
    expect(isPlatformInBeta("tiktok")).toBe(false);
    expect(betaPlatformsLabel()).toBe("YouTube Shorts");
  });

  it("parses a comma-separated platform list", () => {
    process.env.BETA_PLATFORMS = "youtube, TikTok";
    expect(getBetaPlatforms()).toEqual(["youtube", "tiktok"]);
    expect(isPlatformInBeta("tiktok")).toBe(true);
    expect(betaPlatformsLabel()).toBe("YouTube Shorts, TikTok");
  });

  it("ignores unknown platforms and falls back to the default when none are valid", () => {
    process.env.BETA_PLATFORMS = "youtube,myspace";
    expect(getBetaPlatforms()).toEqual(["youtube"]);

    process.env.BETA_PLATFORMS = "myspace,vine";
    expect(getBetaPlatforms()).toEqual(["youtube"]);
  });

  it("dedupes repeated entries", () => {
    process.env.BETA_PLATFORMS = "youtube,youtube,tiktok";
    expect(getBetaPlatforms()).toEqual(["youtube", "tiktok"]);
  });
});
