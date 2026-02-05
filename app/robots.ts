import { MetadataRoute } from "next";
import { CONFIG } from "@/lib/engine/config";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = CONFIG.appBaseUrl;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/v1/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
