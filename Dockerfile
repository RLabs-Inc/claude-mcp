FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Build the app
RUN bun build ./src/index.ts --target bun --outdir ./dist

# Expose port
EXPOSE 3000

# Run the app
CMD ["bun", "dist/index.js"]