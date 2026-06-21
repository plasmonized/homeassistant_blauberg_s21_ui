#!/usr/bin/with-contenv bashio

set -e

S21_IP=$(bashio::config 's21_ip')
S21_PORT=$(bashio::config 's21_port')
S21_SLAVE_ID=$(bashio::config 's21_slave_id')
MQTT_HOST=$(bashio::config 'mqtt_host')
MQTT_PORT=$(bashio::config 'mqtt_port')
MQTT_USER=$(bashio::config 'mqtt_user')
MQTT_PASSWORD=$(bashio::config 'mqtt_password')
HA_TOKEN=$(bashio::config 'ha_token')
LOG_LEVEL=$(bashio::config 'log_level')
WEB_PORT=$(bashio::config 'web_port')
POLL_INTERVAL=$(bashio::config 'poll_interval')

export S21_IP S21_PORT S21_SLAVE_ID
export MQTT_HOST MQTT_PORT MQTT_USER MQTT_PASSWORD
export HA_TOKEN LOG_LEVEL POLL_INTERVAL
export PORT="$WEB_PORT"
export NODE_ENV="production"

export DATA_DIR="/data"
export DB_NAME="blauberg"
export DB_USER="blauberg"
export DB_PASS="blauberg"
export DB_HOST="localhost"
export DB_PORT="5432"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Supervisor token is auto-injected by HA as $SUPERVISOR_TOKEN env var
if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
    export HA_API_URL="http://supervisor/core/api"
    bashio::log.info "Home Assistant Supervisor API verfügbar"
fi

# Auto-detect MQTT if Mosquitto addon is installed
if bashio::services.available "mqtt" 2>/dev/null; then
    bashio::log.info "MQTT Service gefunden, auto-konfiguriere..."
    export MQTT_HOST="$(bashio::services mqtt host)"
    export MQTT_PORT="$(bashio::services mqtt port)"
    export MQTT_USER="$(bashio::services mqtt username)"
    export MQTT_PASSWORD="$(bashio::services mqtt password)"
fi

bashio::log.info "Starte Blauberg S21 Ventilation Controller..."
bashio::log.info "S21 Gerät: $S21_IP:$S21_PORT (Slave ID: $S21_SLAVE_ID)"
bashio::log.info "Web-Port: $WEB_PORT"

# === PostgreSQL ===
bashio::log.info "Initialisiere PostgreSQL Datenbank..."

PG_BASE="/var/lib/postgresql"
PG_DATA="$PG_BASE/data"
PG_LOG="$PG_DATA/server.log"

mkdir -p "$PG_DATA"
chown -R postgres:postgres "$PG_BASE"

# Only run initdb if database was never initialized
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    bashio::log.info "Erstelle neue Datenbank..."
    su - postgres -c "initdb -D $PG_DATA"
fi

# Add trust rule only if not already present
if ! grep -q "127.0.0.1/32 trust" "$PG_DATA/pg_hba.conf" 2>/dev/null; then
    su - postgres -c "echo 'host all all 127.0.0.1/32 trust' >> $PG_DATA/pg_hba.conf"
fi

# Start PostgreSQL — log inside data dir (postgres-owned)
su - postgres -c "pg_ctl -D $PG_DATA -l $PG_LOG start"

sleep 2
su - postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\" 2>/dev/null || true"
su - postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\" 2>/dev/null || true"

# === Schema ===
bashio::log.info "Pushe Datenbank Schema..."
cd /app
npm run db:push

# === App ===
bashio::log.info "Starte Web-Anwendung..."
npm run start
