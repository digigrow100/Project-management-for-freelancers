FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tar \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/lib/hms-agent /var/log/hms-agent /opt/stacks/sites \
 && chown -R node:node /var/lib/hms-agent /var/log/hms-agent /opt/stacks/sites \
 && chmod 700 /var/lib/hms-agent /var/log/hms-agent
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/hms-agent-entrypoint
RUN chmod 755 /usr/local/bin/hms-agent-entrypoint
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/hms-agent-entrypoint"]
