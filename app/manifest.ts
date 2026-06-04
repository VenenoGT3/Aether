import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aether - Premium Influencer Marketing",
    short_name: "Aether",
    description: "The premium Apple-designed marketing ecosystem. Connect brands and creators, secure escrows, and automate campaign tracking.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#007aff",
    orientation: "portrait",
    categories: ["business", "social", "finance"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
