# Bitfinex P2P Exchange

A distributed peer-to-peer exchange system built with TypeScript and Grenache, a DHT-based microservices framework.

## Overview

This project implements a distributed exchange that allows clients to submit and match buy/sell orders in a peer-to-peer network.

## Features

- Decentralized orderbook with real-time synchronization
- Peer-to-peer communication via Grenache DHT
- Automatic order matching with price-time priority
- Support for market operations (buy/sell orders)
- Robust error handling and recovery (exponential backoff)

## Technical Architecture

The system consists of three main components:

- **Order Model**: Core domain entity representing trade orders
- **OrderBook Model**: Maintains order collections and matching logic
- **P2PService**: Handles inter-node communication using Grenache

All components work together to provide a resilient, distributed trading platform with automatic recovery from network issues and race conditions.

## Prerequisites

- Node.js (v18 or higher)
- npm
- Grenache Grape (installed globally, for local setup)

## Quick Start

The simplest way to run the entire system is using the provided script:

1. Install dependencies:
   ```
   npm install
   ```

2. Build the TypeScript code:
   ```
   npm run build
   ```

3. Run the entire system with one command:
   ```
   bash run_local_test.sh
   ```

This script automatically:
- Starts Grape DHT nodes
- Launches exchange server nodes
- Starts client nodes
- Runs the system for 30 seconds
- Provides a detailed activity summary at the end
- Creates log files for all components

No additional steps are required - everything is handled for you.

## Troubleshooting

Logs are stored in the `logs` directory:
- `logs/grape*.log`: DHT node logs
- `logs/server*.log`: Exchange server logs
- `logs/client*.log`: Client node logs

## Known Issues

### Docker Connectivity Problems

- Repeated `ECONNREFUSED` errors when clients try to connect to exchange nodes
- Failed requests during orderbook synchronization with errors like: `ERR_REQUEST_GENERIC: connect ECONNREFUSED 172.18.0.3:1024`
- Clients able to see their own orders but unable to sync with exchange nodes
- Orders being added locally but not propagated to the network

#### Root Causes

1. **Service Discovery Timing**: In Docker, the grape nodes and exchange services may not be fully ready when clients attempt to connect, even when using the `depends_on` with healthchecks.

2. **IP vs. Hostname Resolution**: Clients are trying to connect to exchange nodes using IP addresses (e.g., 172.18.0.3) rather than container names. The Grenache DHT advertises services with their IP addresses, which can cause issues in Docker networks.

3. **Port Binding Issues**: While our fixes improved port availability checks, there might still be problems with how ports are bound and exposed between containers.

4. **Different Docker Networks**: Docker's networking may not fully support the way Grenache DHT nodes discover and communicate with each other.

Note: These issues primarily affect the Docker deployment and not the local development setup using the `run_local_test.sh` script, which works reliably.

## Docker Deployment

This project includes Docker support for easy deployment:

### Quick Start

1. Build the Docker images:
   ```
   docker compose build
   ```

2. Start the Docker containers:
   ```
   docker compose up -d
   ```
This will start:
- 2 Grape DHT nodes
- 2 Exchange server nodes
- 2 Client nodes that automatically submit random orders

### Advanced Docker Commands

#### Clean Rebuild (Recommended for Changes)

If you've made changes to the code or configuration, perform a clean rebuild:

```
docker compose down --remove-orphans && docker compose rm -f && docker compose build --no-cache
```

This command:
- Stops and removes all running containers
- Removes any orphaned containers
- Forces removal of any existing containers
- Rebuilds all images without using cache

#### Viewing Logs

To view logs from all containers:
```
docker compose logs
```

To view logs from a specific service:
```
docker compose logs client1
```

To follow logs in real-time:
```
docker compose logs -f
```

#### Stopping Services

To stop all containers:
```
docker compose down
```

To completely clean up, including networks:
```
docker compose down --remove-orphans
```
## License

MIT 