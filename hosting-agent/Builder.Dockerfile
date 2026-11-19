FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY git-askpass.sh /usr/local/bin/hms-git-askpass
RUN chmod 755 /usr/local/bin/hms-git-askpass
USER 1000:1000
WORKDIR /work
