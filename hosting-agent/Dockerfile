FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
USER node
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "src/index.ts"]
