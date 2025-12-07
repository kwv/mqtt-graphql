FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY tsconfig.json ./
COPY src ./src

# Compile to standalone binary
RUN bun build src/index.ts --compile --target=bun-linux-x64 --outfile=server

# Stage 2: Minimal runtime
FROM gcr.io/distroless/base-debian12
COPY --from=builder /app/server /server
CMD ["/server"]