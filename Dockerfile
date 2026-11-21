ARG BUILD_ARCH=amd64
ARG BUILD_FROM=ghcr.io/home-assistant/${BUILD_ARCH}-base:3.21
FROM ${BUILD_FROM} AS build

ENV LANG=C.UTF-8
ENV NODE_ENV=production

RUN apk add --no-cache \
    nodejs \
    npm \
    postgresql-dev \
    build-base \
    python3

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev --no-audit --no-fund

COPY drizzle.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY vite.config.ts ./
COPY components.json ./

COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/
COPY script/ ./script/

RUN npm run check && npm run build

# Keep the same Alpine/PostgreSQL generation as existing installations.
# Build tools stay in the build stage; /data is still supplied by Supervisor.
FROM ${BUILD_FROM} AS runtime
ARG BUILD_ARCH
ARG BUILD_VERSION=dev
ENV LANG=C.UTF-8
ENV NODE_ENV=production

LABEL io.hass.version="${BUILD_VERSION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="app" \
    org.opencontainers.image.title="Blauberg S21 Ventilation Controller" \
    org.opencontainers.image.description="Modbus TCP Steuerung für Blauberg S21 Lüftungsgeräte" \
    org.opencontainers.image.source="https://github.com/plasmonized/homeassistant_blauberg_s21_ui" \
    org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache nodejs npm curl jq postgresql postgresql-client
WORKDIR /app
COPY --from=build /app/dist ./dist
# Drizzle/tsx are currently devDependencies but REQUIRED by db:push at startup.
# Do not blindly prune devDependencies, or existing databases stop starting.
COPY --from=build /app/node_modules ./node_modules
COPY package.json drizzle.config.ts tsconfig.json ./
COPY shared/ ./shared/

COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
