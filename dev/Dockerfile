FROM node:10.15.3

RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 2930ADAE8CAF5059EE73BB4B58712A2291FA4AD5 && \
	echo "deb http://repo.mongodb.org/apt/debian stretch/mongodb-org/3.6 main" | tee /etc/apt/sources.list.d/mongodb-org-3.6.list && \
	apt-get update && \
	apt-get install -y mongodb-org && \
	rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
RUN cd /app && npm install

WORKDIR /app

COPY dev/init /root/init

ENTRYPOINT /root/init && /bin/sh