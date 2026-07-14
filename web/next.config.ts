import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les réponses.
// CSP volontairement partielle : on verrouille le cadrage (clickjacking),
// la base-uri, les plugins et la cible des formulaires, SANS restreindre
// script-src/style-src — Next.js s'appuie sur du style/script inline et
// imposerait des nonces, hors périmètre de ce durcissement.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  {
    key: "Content-Security-Policy",
    value: ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
