FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev || true

COPY server.js ./

ENV PORT=3001
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
