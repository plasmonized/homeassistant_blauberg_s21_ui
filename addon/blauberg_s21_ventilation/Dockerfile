# Blauberg S21 Ventilation Controller Home Assistant Add-on Dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Environment variables
ENV LANG=C.UTF-8
ENV NODE_ENV=production

# Install Node.js, npm, PostgreSQL client und Build-Tools
RUN apk add --no-cache \
    nodejs \
    npm \
    curl \
    jq \
    postgresql \
    postgresql-client \
    postgresql-dev \
    build-base \
    python3 \
    py3-pip

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY drizzle.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY vite.config.ts ./
COPY components.json ./

# Install dependencies
RUN npm ci --production=false

# Copy application source
COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/
COPY attached_assets/ ./attached_assets/
COPY script/ ./script/

# Build frontend
RUN npm run build

# Copy and setup run script
COPY run.sh /
RUN chmod a+x /run.sh

# Labels
LABEL \
    io.hass.name="Blauberg S21 Ventilation Controller" \
    io.hass.description="Modbus TCP Steuerung für Blauberg S21 Lüftungsgeräte" \
    io.hass.arch="armhf|aarch64|amd64|armv7|i386" \
    io.hass.type="addon" \
    io.hass.version="1.0.0"

# Run
CMD ["/run.sh"]
