#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Bitfinex P2P Exchange Local Test      ${NC}"
echo -e "${BLUE}=========================================${NC}"

echo -e "\n${YELLOW}Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18 or higher.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed. Please install npm.${NC}"
    exit 1
fi

if ! command -v grape &> /dev/null; then
    echo -e "${RED}Grape is not installed. Installing globally...${NC}"
    npm install -g grenache-grape
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${YELLOW}Building TypeScript code...${NC}"
npm run build

mkdir -p logs

echo -e "\n${YELLOW}Step 1: Stopping any existing processes...${NC}"
pkill -f "node dist/index.js" || true
pkill grape || true

echo -e "Ensuring all ports are free..."
for PORT in 20001 20002 30001 30002 3000 3001; do
  PID=$(lsof -ti:$PORT)
  if [ ! -z "$PID" ]; then
    echo "Killing process using port $PORT (PID: $PID)"
    kill -9 $PID 2>/dev/null || true
  fi
done

sleep 3

echo -e "\n${YELLOW}Step 2: Starting Grape DHT nodes...${NC}"
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20001' > logs/grape1.log 2>&1 &
GRAPE1_PID=$!
grape --dp 20002 --aph 30002 --bn '127.0.0.1:20001' > logs/grape2.log 2>&1 &
GRAPE2_PID=$!
echo -e "${GREEN}✓ Started Grape nodes with PIDs: $GRAPE1_PID, $GRAPE2_PID${NC}"
sleep 3

if ! ps -p $GRAPE1_PID > /dev/null || ! ps -p $GRAPE2_PID > /dev/null; then
  echo -e "${RED}Error: Failed to start Grape nodes. Check logs/grape*.log for details${NC}"
  cat logs/grape1.log
  cat logs/grape2.log
  exit 1
fi

echo -e "\n${YELLOW}Step 3: Starting exchange server nodes...${NC}"
NODE_ENV=production GRAPE_URL=http://127.0.0.1:30001 NODE_PORT=3000 NODE_TYPE=server node dist/index.js > logs/server1.log 2>&1 &
SERVER1_PID=$!
NODE_ENV=production GRAPE_URL=http://127.0.0.1:30002 NODE_PORT=3001 NODE_TYPE=server node dist/index.js > logs/server2.log 2>&1 &
SERVER2_PID=$!
echo -e "${GREEN}✓ Started server nodes with PIDs: $SERVER1_PID, $SERVER2_PID${NC}"
sleep 5

echo -e "\n${YELLOW}Step 4: Starting client nodes...${NC}"
NODE_ENV=production GRAPE_URL=http://127.0.0.1:30001 NODE_TYPE=client CLIENT_ID=client1 node dist/index.js > logs/client1.log 2>&1 &
CLIENT1_PID=$!
NODE_ENV=production GRAPE_URL=http://127.0.0.1:30002 NODE_TYPE=client CLIENT_ID=client2 node dist/index.js > logs/client2.log 2>&1 &
CLIENT2_PID=$!
echo -e "${GREEN}✓ Started client nodes with PIDs: $CLIENT1_PID, $CLIENT2_PID${NC}"

echo -e "\n${YELLOW}Step 5: Letting the system run for 30 seconds to generate activity...${NC}"
for i in {1..30}; do
    echo -ne "\rRunning: $i/30 seconds"
    sleep 1
done
echo -e "\n${GREEN}✓ System has been running for 30 seconds${NC}"

echo -e "\n${YELLOW}Step 6: Showing summary of activity...${NC}"

echo -e "\n${BLUE}Checking for errors in logs:${NC}"
if grep -q "Error:" logs/grape*.log logs/server*.log logs/client*.log; then
  echo -e "${RED}Errors were found in the logs:${NC}"
  grep -A 3 "Error:" logs/grape*.log logs/server*.log logs/client*.log
  echo -e "${YELLOW}Note: Some errors might be expected during startup or when connections are reset.${NC}"
else
  echo -e "${GREEN}No major errors found in logs.${NC}"
fi

BUY_ORDERS=$(grep "submitOrder" logs/server*.log | grep "buy" | wc -l)
SELL_ORDERS=$(grep "submitOrder" logs/server*.log | grep "sell" | wc -l)
MATCHES=$(grep "announceMatch" logs/server*.log | wc -l)

echo -e "\n${BLUE}Activity Summary:${NC}"
echo -e "Buy Orders Submitted: ${GREEN}${BUY_ORDERS}${NC}"
echo -e "Sell Orders Submitted: ${GREEN}${SELL_ORDERS}${NC}"
echo -e "Order Matches: ${GREEN}${MATCHES}${NC}"

echo -e "\n${BLUE}Server 1 Order Summary:${NC}"
grep "ORDERBOOK SUMMARY" logs/server1.log | tail -1

echo -e "\n${BLUE}Server 2 Order Summary:${NC}"
grep "ORDERBOOK SUMMARY" logs/server2.log | tail -1

echo -e "\n${BLUE}Client 1 Latest Orderbook State:${NC}"
awk '/ORDERBOOK STATE/{flag=1; print; next} /=========================/{flag=0; print} flag{print}' logs/client1.log | tail -15

echo -e "\n${BLUE}Client 2 Latest Orderbook State:${NC}"
awk '/ORDERBOOK STATE/{flag=1; print; next} /=========================/{flag=0; print} flag{print}' logs/client2.log | tail -15

echo -e "\n${BLUE}Recent Order Matches:${NC}"
grep -A 3 "Order matched with" logs/client*.log | tail -8

echo -e "\n${YELLOW}Complete logs are available in the logs directory:${NC}"
echo -e "  - ${GREEN}logs/grape1.log${NC} - Grape DHT node 1"
echo -e "  - ${GREEN}logs/grape2.log${NC} - Grape DHT node 2"
echo -e "  - ${GREEN}logs/server1.log${NC} - Exchange server node 1"
echo -e "  - ${GREEN}logs/server2.log${NC} - Exchange server node 2"
echo -e "  - ${GREEN}logs/client1.log${NC} - Client node 1"
echo -e "  - ${GREEN}logs/client2.log${NC} - Client node 2"

echo -e "\n${YELLOW}To stop all services, run:${NC}"
echo -e "${GREEN}pkill -f \"node dist/index.js\" && pkill grape${NC}"

echo -e "\n${BLUE}=========================================${NC}"
echo -e "${BLUE}  Test Complete                          ${NC}"
echo -e "${BLUE}=========================================${NC}"