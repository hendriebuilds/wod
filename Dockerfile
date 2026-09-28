# Stage 1: Build React admin panel
FROM node:22-alpine AS admin-builder
WORKDIR /admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY admin/ .
RUN npm run build

# Stage 2: Bot + API server
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/hendriebuilds/wod"
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.js .
COPY config.json .
COPY src/ ./src/
COPY --from=admin-builder /admin/dist ./admin/dist
EXPOSE 3001
CMD ["node", "index.js"]
