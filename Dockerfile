# Lightweight image for running `wrangler pages dev` locally.
# This is for local development only — production runs on Cloudflare's edge.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Source is volume-mounted in docker-compose; copy as a fallback for plain `docker build/run`.
COPY . .

# Wrangler Pages dev server port.
EXPOSE 8788

CMD ["npm", "run", "cf:dev"]
