# ── Single-stage for now (MCP servers run as tsx child processes) ──────────────
# When MCP servers are compiled or moved to separate services, switch to multi-stage.
FROM node:22-slim

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy source (needed for tsx MCP servers)
COPY tsconfig.json ./
COPY src/ ./src/

# Runtime dirs
COPY data/ ./data/
COPY sandbox/ ./sandbox/
RUN mkdir -p logs docs

ENV NODE_ENV=production
ENV PORT=3010

EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3010/health').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["npx", "tsx", "src/server.ts"]
