import type { MetadataRoute } from "next";
import { HREFLANG, LOCALES } from "../i18n/config";
import { INDEXABLE_PATHS, url, SITE_URL } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return LOCALES.flatMap((locale) =>
    INDEXABLE_PATHS.map((path) => ({
      url: url(locale, path),
      lastModified,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
      alternates: { languages: { ...Object.fromEntries(LOCALES.map((l) => [HREFLANG[l], url(l, path)])), "x-default": `${SITE_URL}/en${path}` } },
    })),
  );
}
