FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY certs ./certs
COPY tests ./tests
RUN mkdir -p uploads

EXPOSE 3000
CMD ["node", "src/server.js"]
