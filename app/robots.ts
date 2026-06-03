import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://aether.app").replace(/\/+$/, "");

/**
 * Crawl the public marketing surface; keep authenticated app areas, auth flows,
 * and API routes out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/creator/", "/business/", "/dashboard"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
