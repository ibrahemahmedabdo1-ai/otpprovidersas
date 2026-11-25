FROM oven/bun:1.2.21
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY index.ts receipt-rules.ts ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "index.ts"]
