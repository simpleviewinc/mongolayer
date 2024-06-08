FROM node:10.15.3

COPY package.json /app/package.json
RUN cd /app && npm install

WORKDIR /app