FROM node:24-slim
ENV NODE_ENV=production TZ=America/Chicago DATA_DIR=/data PHOTO_DIR=/photos
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Shown on the admin page and at /healthz.
ARG HOMEBOARD_COMMIT=""
ENV HOMEBOARD_COMMIT=${HOMEBOARD_COMMIT}
LABEL org.opencontainers.image.source="https://github.com/joshoohaah/homeboard" \
      org.opencontainers.image.description="Self-hosted family wall calendar" \
      org.opencontainers.image.licenses="NOASSERTION"
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.js"]
