import type { Framework } from "./validate";

export function frameworkFromManifest(files: string[], manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null): Framework | null {
  const dependencies = { ...manifest?.dependencies, ...manifest?.devDependencies };
  if (dependencies.next || files.some((file) => /^next\.config\./.test(file))) return "nextjs";
  if (dependencies.nuxt || files.some((file) => /^nuxt\.config\./.test(file))) return "nuxt";
  if (dependencies.vue || files.some((file) => /^vite\.config\./.test(file) && dependencies.vue)) return "vue";
  if ((dependencies.react && (dependencies.vite || dependencies["react-scripts"])) || files.some((file) => file === "vite.config.ts" || file === "vite.config.js")) return dependencies.vue ? "vue" : "react";
  if (files.includes("Dockerfile")) return "dockerfile";
  if (files.includes("package.json")) return "node";
  if (files.includes("index.html")) return "static";
  return null;
}
