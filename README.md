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

Please follow commands below:

1. Install dependencies:
   ```
   npm install
   ```

2. Build the TypeScript code:
   ```
   npm run build
   ```

3. Run test:
   ```
   npm run test
   ```


## Troubleshooting

Logs are stored in the `logs` directory:
- `logs/grape*.log`: DHT node logs
- `logs/server*.log`: Exchange server logs
- `logs/client*.log`: Client node logs

## Known Issues

## License

MIT 