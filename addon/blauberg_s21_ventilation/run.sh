#!/usr/bin/with-contenv bashio
# Blauberg S21 Ventilation Controller Add-on Start Script

set -e

# Get configuration from Home Assistant
CONFIG_PATH=/data/options.json

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

# Export environment variables
export S21_IP="$S21_IP"
export S21_PORT="$S21_PORT"
export S21_SLAVE_ID="$S21_SLAVE_ID"
export MQTT_HOST="$MQTT_HOST"
export MQTT_PORT="$MQTT_PORT"
export MQTT_USER="$MQTT_USER"
export MQTT_PASSWORD="$MQTT_PASSWORD"
export HA_TOKEN="$HA_TOKEN"
export LOG_LEVEL="$LOG_LEVEL"
export PORT="$WEB_PORT"
export POLL_INTERVAL="$POLL_INTERVAL"
export NODE_ENV="production"

# Persistent data directory for Home Assistant Add-on
export DATA_DIR="/data"
export DB_NAME="blauberg"
export DB_USER="blauberg"
export DB_PASS="blauberg"
export DB_HOST="localhost"
export DB_PORT="5432"

# Build DATABASE_URL
export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Home Assistant Supervisor API Token (auto-detected)
if bashio::supervisor.ping 2>/dev/null; then
    export SUPERVISOR_TOKEN="$(bashio::supervisor.token)"
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

# === START POSTGRESQL ===
bashio::log.info "Initialisiere PostgreSQL Datenbank..."

# Initialize DB if not exists
if [ ! -d /var/lib/postgresql/data ]; then
    mkdir -p /var/lib/postgresql/data
    chown postgres:postgres /var/lib/postgresql/data
    su - postgres -c "initdb -D /var/lib/postgresql/data"
fi

# Update postgres config to allow local auth
su - postgres -c "echo \"host all all 127.0.0.1/32 trust\" >> /var/lib/postgresql/data/pg_hba.conf"

# Start PostgreSQL
su - postgres -c "pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql.log start"

# Create database if not exists
sleep 2
su - postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\" 2>/dev/null || true"
su - postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\" 2>/dev/null || true"

# === PUSH DATABASE SCHEMA ===
bashio::log.info "Pushe Datenbank Schema..."
cd /app
npm run db:push

# === START APPLICATION ===
bashio::log.info "Starte Web-Anwendung..."

# Start the application
npm run start
