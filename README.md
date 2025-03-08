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
(I added logs files example just in case, but when you run the script, it will anyway remove the logs file and replace with the new ones)

## Troubleshooting

Logs are stored in the `logs` directory:
- `logs/grape*.log`: DHT node logs
- `logs/server*.log`: Exchange server logs
- `logs/client*.log`: Client node logs

## Known Issues

## License

MIT 