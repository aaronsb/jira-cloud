#!/bin/bash

# Function to log error messages
log_error() {
    echo "[ERROR] $1" >&2
}

# Function to log info messages
log_info() {
    echo "[INFO] $1" >&2
}

# Validate required environment variables
if [ -z "$JIRA_API_TOKEN" ]; then
    log_error "JIRA_API_TOKEN environment variable is required"
    exit 1
fi

if [ -z "$JIRA_EMAIL" ]; then
    log_error "JIRA_EMAIL environment variable is required"
    exit 1
fi

# Ensure config directories exist with proper permissions
for dir in "/app/config"; do
    if [ ! -d "$dir" ]; then
        log_info "Creating directory: $dir"
        mkdir -p "$dir" || {
            log_error "Failed to create directory: $dir. This is expected if running as non-root user."
            log_info "Directory will be created by Docker volume mount"
        }
        chmod 750 "$dir" || log_info "Directory permissions will be set by Docker volume mount"
    fi
done

# Create logs directory with proper permissions
LOGS_DIR="/app/logs"
if [ ! -d "$LOGS_DIR" ]; then
    log_info "Creating logs directory: $LOGS_DIR"
    mkdir -p "$LOGS_DIR" || {
        log_error "Failed to create logs directory: $LOGS_DIR. This is expected if running as non-root user."
        log_info "Directory will be created by Docker volume mount"
    }
    chmod 750 "$LOGS_DIR" || log_info "Logs directory permissions will be set by Docker volume mount"
fi

# Set MCP mode environment variable
export MCP_MODE=true
export LOG_FILE="/app/logs/jira-cloud-mcp.log"

# Trap signals for clean shutdown
trap 'log_info "Shutting down..."; exit 0' SIGTERM SIGINT

# Execute the main application
exec node build/index.js
