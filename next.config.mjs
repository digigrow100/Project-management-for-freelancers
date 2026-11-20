/** @type {import('next').NextConfig} */
// The owner approval page alone may talk to the owner's own signing program on this computer (loopback, one exact port).
const SIGNER_ORIGIN = "http://127.0.0.1:47419";
const csp = (extraConnect = "") =>
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co" + extraConnect + ";";
// Only website upload pages may connect to the configured HTTPS agent origin.
function uploadOrigin(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port || !/^[a-z0-9.-]+$/.test(url.hostname)) throw Error('Invalid HOSTING_AGENT_URL');
  return ' ' + url.origin;
}
const agentOrigin = uploadOrigin(process.env.HOSTING_AGENT_URL);
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {source:"/:path*",has:[{type:"host",value:"web\\.housemysite\\.com"}],headers:[{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive, nosnippet, noimageindex"}]},
      {source:"/client/:path*",headers:[{key:"Cache-Control",value:"private, no-store, max-age=0"}]},
      {source:"/hosting/:path*",headers:[{key:"Cache-Control",value:"private, no-store, max-age=0"}]},
      {source:"/login/:path*",headers:[{key:"Cache-Control",value:"private, no-store, max-age=0"}]},
      {
        // All other pages keep the strict policy; scoped exceptions are defined below.
        source: "/:path((?!(?:hosting/(?:sources|backups|email)$|(?:client|hosting)/apps(?:/|$))).*)",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: csp() }],
      },
      {
        source: '/:portal(client|hosting)/apps/:path*',
        headers: [...securityHeaders, {key: 'Content-Security-Policy', value: csp(agentOrigin)}],
      },
      {
        // The owner pages where something is signed on the owner's own computer.
        source: "/hosting/:page(sources|backups|email)",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: csp(" " + SIGNER_ORIGIN) }],
      },
    ];
  },
};

export default nextConfig;
