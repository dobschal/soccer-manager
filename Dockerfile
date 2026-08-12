FROM node:20-slim

ARG COMMIT_HASH=unknown

WORKDIR /usr/src/app

# ffmpeg re-wraps chat voice messages as AAC/m4a. Chrome and Firefox record
# WebM/Opus, which Safari and the iOS WebView cannot decode at all (#541).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY scripts ./scripts

RUN npm install

COPY server ./server
COPY client ./client

RUN node scripts/build-native-bundle.mjs $COMMIT_HASH
RUN node scripts/build-desktop-bundle.mjs $COMMIT_HASH

EXPOSE 3000

CMD ["node", "server/api.js"]
