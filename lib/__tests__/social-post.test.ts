import { describe, expect, it } from "vitest";
import {
  defaultViewProviderForPlatform,
  detectSocialPlatform,
  extractPlatformPostId,
} from "../social-post";

describe("social post helpers", () => {
  it("detects supported social platforms from URLs", () => {
    expect(detectSocialPlatform("https://www.tiktok.com/@a/video/12345678")).toBe(
      "tiktok"
    );
    expect(detectSocialPlatform("https://youtu.be/abc123xyz99")).toBe("youtube");
    expect(detectSocialPlatform("https://www.instagram.com/reel/abc/")).toBe(
      "instagram"
    );
  });

  it("extracts YouTube video IDs from common URL shapes", () => {
    expect(
      extractPlatformPostId(
        "youtube",
        "https://www.youtube.com/watch?v=abc123xyz99"
      )
    ).toBe("abc123xyz99");
    expect(
      extractPlatformPostId("youtube", "https://youtu.be/abc123xyz99")
    ).toBe("abc123xyz99");
    expect(
      extractPlatformPostId(
        "youtube",
        "https://www.youtube.com/shorts/abc123xyz99"
      )
    ).toBe("abc123xyz99");
  });

  it("extracts TikTok video IDs from canonical post URLs", () => {
    expect(
      extractPlatformPostId(
        "tiktok",
        "https://www.tiktok.com/@creator/video/7381223344556677889"
      )
    ).toBe("7381223344556677889");
  });

  it("maps direct platforms to official provider hints", () => {
    expect(defaultViewProviderForPlatform("youtube")).toBe("youtube_official");
    expect(defaultViewProviderForPlatform("tiktok")).toBe("tiktok_official");
    expect(defaultViewProviderForPlatform("instagram")).toBeNull();
  });
});
