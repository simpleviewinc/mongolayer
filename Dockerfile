FROM node:18.17.0

COPY package.json /app/package.json
RUN cd /app && npm install

WORKDIR /app