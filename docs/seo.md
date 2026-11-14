# SEO and search visibility

What the public website (`apps/website`) ships today:

| Item | Where | Notes |
|---|---|---|
| Per-language URLs | `/en`, `/ar`, `/ru`, `/es`, `/de`, `/zh` | `/` redirects to `/en` (temporary redirect) |
| Canonical + hreflang (+ x-default) | `src/lib/seo.ts` → `alternates()` | every indexable page lists all six languages |
| Title and description per page and language | `src/i18n/*.ts` (`meta`) | length limits enforced by `tests/seo.test.ts` |
| Open Graph / Twitter cards | `pageMetadata()` | image `public/og.png` (1200×630) |
| `robots.txt` | `src/app/robots.ts` | points to the sitemap |
| `sitemap.xml` | `src/app/sitemap.ts` | 5 indexable pages × 6 languages, with language alternates |
| Structured data (JSON-LD) | `src/components/JsonLd.tsx` | Organization + WebSite on every page, FAQPage on home (matches visible FAQ), BreadcrumbList on inner pages |
| Legal templates | `noindex, follow` | placeholder text must never be indexed |
| Performance | static generation, no client JS except Next hydration, self-hosted fonts via `next/font`, `prefers-color-scheme` theming | |
| Accessibility | skip link, semantic landmarks, visible focus, RTL for Arabic, reduced-motion | |

## Do this after deploying (cannot be done from the repo)

1. Set `NEXT_PUBLIC_SITE_URL` to the final https origin (no trailing slash) in Vercel; redeploy.
2. Google Search Console: add the property (Domain), verify (or set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`), submit `/sitemap.xml`.
3. Bing Webmaster Tools: import from Search Console or verify (`NEXT_PUBLIC_BING_SITE_VERIFICATION`), submit the sitemap.
4. Once real legal documents replace the templates, remove `{ index: false }` in `src/app/[locale]/legal/[doc]/page.tsx` and add the paths to `INDEXABLE_PATHS`.
5. Publish real pricing on the pricing page when the administrator configures it, then update `meta.pricing` descriptions.
6. Do not claim certifications, uptime or customer counts in copy unless they are true; `tests/seo.test.ts` blocks obvious price/guarantee claims.

## Other apps

The customer console, admin and support apps must send `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` on authenticated pages (admin and support already must per `CONVENTIONS.md`). They are not part of the public sitemap.
