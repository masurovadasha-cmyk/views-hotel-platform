FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS base
WORKDIR /workspace

FROM base AS dependencies
RUN --mount=type=secret,id=npm_ca \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  npm install --global pnpm@10.18.3 --ignore-scripts --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

FROM dependencies AS build
RUN --mount=type=secret,id=npm_ca \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  pnpm --filter @views/api... install --frozen-lockfile --ignore-scripts
COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/api/src ./apps/api/src
RUN pnpm --filter @views/api build

FROM dependencies AS production-dependencies
RUN --mount=type=secret,id=npm_ca \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  pnpm --filter @views/api... install --prod --frozen-lockfile --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY apps/api/ops ./apps/api/ops
# Preserve the absolute /app/ops path used by the maintenance compose service.
RUN ln -s /workspace/apps/api /app \
  && mkdir -p /var/lib/views-maintenance \
  && chown node:node /var/lib/views-maintenance \
  && chmod 700 /var/lib/views-maintenance
WORKDIR /app
USER node
EXPOSE 3001
CMD ["node","dist/main.js"]
