FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    chromium \
    chromium-driver \
    xvfb

ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./

RUN npm ci
RUN npm i -g pm2
COPY . .

EXPOSE 3000

CMD ["pm2-runtime", "src/index.js"]
