# Production image for running on your own server (see deploy/AWS.md).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && test -x node_modules/.bin/next

FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Migrations run on every start; they only apply what's new.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
