FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache wget busybox-extras && \
    npm install -g typescript
COPY package*.json ./
RUN npm install
COPY . .
# Add patch script
COPY patch-grenache-http.js /app/
RUN node /app/patch-grenache-http.js

RUN mkdir -p /app/logs
RUN npm run build || (echo "Build failed" && cat $(find . -name "*.log") 2>/dev/null && exit 1)

CMD ["node", "dist/index.js"]