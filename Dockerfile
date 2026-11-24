FROM node:24-slim
ENV NODE_ENV=production TZ=America/Chicago DATA_DIR=/data PHOTO_DIR=/photos
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.js"]
