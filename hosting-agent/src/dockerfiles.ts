import type { Framework } from "./validate.ts";

export function generatedDockerfile(framework: Framework) {
  if (framework === "nextjs") {
    return `FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["npm","start"]
`;
  }
  if (framework === "nuxt") {
    return `FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=3000 PORT=3000
EXPOSE 3000
CMD ["node",".output/server/index.mjs"]
`;
  }
  if (framework === "node") {
    return `FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm","start"]
`;
  }
  if (framework === "react" || framework === "vue") {
    return `FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm install && npm run build && mkdir -p /site && if [ -d dist ]; then cp -a dist/. /site/; elif [ -d build ]; then cp -a build/. /site/; else echo "No dist or build directory" >&2; exit 1; fi
FROM nginx:1.27-alpine
COPY --from=build /site /usr/share/nginx/html
EXPOSE 80
`;
  }
  if (framework === "static") {
    return `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`;
  }
  return "";
}

export const DOCKERIGNORE = `.git
node_modules
.env
*.pem
id_rsa
id_ed25519
`;
