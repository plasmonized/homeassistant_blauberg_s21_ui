ARG BUILD_FROM
FROM $BUILD_FROM

ENV LANG=C.UTF-8
ENV NODE_ENV=production

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

WORKDIR /app

COPY package*.json ./
COPY drizzle.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY vite.config.ts ./
COPY components.json ./

RUN npm install --production=false

COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/
COPY attached_assets/ ./attached_assets/
COPY script/ ./script/

RUN npm run build

COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
