FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_WEB=true \
    WEB_ROOT=/app/public

WORKDIR /app

COPY --chown=node:node cams-api/package.json cams-api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node cams-api/src ./src
COPY --chown=node:node cams-api/scripts ./scripts
COPY --chown=node:node cams-webpage ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
