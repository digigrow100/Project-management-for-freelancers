const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

const out = "/tmp/hms-hosting-preview";
fs.mkdirSync(out, { recursive: true });

const plugin = {
  name: "preview",
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "preview" }));
    build.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve("react") }));
    build.onResolve({ filter: /^react-dom\/server$/ }, () => ({ path: require.resolve("react-dom/server") }));
    build.onLoad({ filter: /.*/, namespace: "preview" }, () => ({
      contents: "const React=require('react');module.exports=function Link({href,children,...props}){return React.createElement('a',{href,...props},children)};",
      loader: "js",
    }));
  },
};

build({
  entryPoints: [path.join(__dirname, "hosting-dashboard-preview.tsx")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(out, "preview.cjs"),
  plugins: [plugin],
  jsx: "automatic",
}).then(() => {
  const hosting = fs.readFileSync(path.join(__dirname, "../app/(app)/hosting/hosting.css"), "utf8");
  const portal = fs.readFileSync(path.join(__dirname, "../app/(client)/client/portal.css"), "utf8");
  const { previews } = require(path.join(out, "preview.cjs"));
  for (const preview of previews) {
    const adminActive = preview.name.includes("coming") ? "Email Server" : preview.name === "admin-overview" ? "Overview" : "Apps & Websites";
    const adminNav = ["Overview", "Apps & Websites", "Email Server", "Databases", "WordPress", "Security", "Server"].map((label) => `<a class="hms-nav-link${label === adminActive ? " hms-nav-active" : ""}" href="#">${label}</a>`).join("");
    const clientNav = ["Overview", "Apps", "Email Server", "Databases", "WordPress", "Hosting", "Billing"].map((label) => `<a href="#" ${label === "Overview" ? "aria-current=\"page\"" : ""}><span>${label}</span></a>`).join("");
    const body = preview.shell === "client"
      ? `<div class="client-portal"><aside class="client-sidebar"><div class="client-brand">House<span>My</span>Site</div><nav class="client-navigation">${clientNav}</nav></aside><div class="client-workspace"><main class="client-content"><p class="hms-banner">Sample data for design preview. Not production.</p>${preview.html}</main></div></div>`
      : `<div class="hosting-shell" style="display:flex;min-height:100vh"><aside class="sidebar-themed" style="display:flex;flex-direction:column;min-height:100vh"><div style="color:#fff;font-weight:700">House My Site</div><nav style="display:grid;gap:4px">${adminNav}</nav></aside><main style="flex:1;padding:28px 32px"><p class="hms-banner">Sample data for design preview. Not production.</p>${preview.html}</main></div>`;
    const css = preview.shell === "client" ? portal + hosting : hosting;
    fs.writeFileSync(path.join(out, `${preview.name}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f6f8fc;font-family:ui-sans-serif,system-ui,sans-serif}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}${css}</style></head><body>${body}</body></html>`);
  }
  console.log(out);
}).catch((error) => { console.error(error); process.exit(1); });
