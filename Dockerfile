FROM node:20-slim

ARG COMMIT_HASH=unknown

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install

COPY server ./server
COPY client ./client
COPY scripts ./scripts

RUN node scripts/build-native-bundle.mjs $COMMIT_HASH

EXPOSE 3000

CMD ["node", "server/api.js"]
