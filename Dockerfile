# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src ./src
COPY tests ./tests
RUN npm run build

# Stage 2: Production Dependencies (Distroless has no npm)
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 3: Runtime
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Distroless entrypoint is already 'node', so we just pass the file path
CMD ["dist/src/index.js"]