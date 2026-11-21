const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",          // Next.js hydration needs inline bootstrap scripts; no eval anywhere
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const API_BASE_URL = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.otpprovider.com").replace(/[/]+$/, "");
    return [{ source: "/api/:path*", destination: `${API_BASE_URL}/:path*` }];
  },
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      { source: "/:all*(svg|png|ico|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};
