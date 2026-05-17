# Stage 1: Build React admin panel
FROM node:22-alpine AS admin-builder
WORKDIR /admin
COPY admin/package.json ./
RUN npm install
COPY admin/ .
RUN npm run build

# Stage 2: Bot + API server
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY index.js .
COPY settings.json .
COPY config.json .
COPY --from=admin-builder /admin/dist ./admin/dist
EXPOSE 3001
CMD ["node", "index.js"]
