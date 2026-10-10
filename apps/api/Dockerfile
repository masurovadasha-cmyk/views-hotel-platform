FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force \
  && mkdir -p /var/lib/views-maintenance \
  && chown node:node /var/lib/views-maintenance \
  && chmod 700 /var/lib/views-maintenance
COPY --from=build /app/dist ./dist
COPY ops ./ops
USER node
EXPOSE 3001
CMD ["node","dist/main.js"]
