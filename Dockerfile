FROM node:slim

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install

COPY src ./src
COPY client ./client

EXPOSE 3000

CMD ["node", "src/api.js"]
