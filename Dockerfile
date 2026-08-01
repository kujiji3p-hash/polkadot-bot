FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev || true

COPY server.js ./

ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE ${PORT:-3001}

CMD ["node", "server.js"]
