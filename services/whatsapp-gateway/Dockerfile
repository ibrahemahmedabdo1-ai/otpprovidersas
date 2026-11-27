FROM oven/bun:1.4.1
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY index.ts receipt-rules.ts auth-compression.ts auth-migration.ts test-send-rules.ts ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "--smol", "run", "index.ts"]
