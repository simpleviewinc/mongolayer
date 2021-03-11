FROM node:10.15.3

RUN wget -qO - https://www.mongodb.org/static/pgp/server-4.0.asc | apt-key add - && \
	echo "deb http://repo.mongodb.org/apt/debian stretch/mongodb-org/4.0 main" | tee /etc/apt/sources.list.d/mongodb-org-4.0.list && \
	apt-get update && \
	apt-get install -y mongodb-org=4.0.23 && \
	rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
RUN cd /app && npm install

WORKDIR /app

COPY dev/init /root/init

ENTRYPOINT /root/init && /bin/bash