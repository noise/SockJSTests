# Overview

A simple prototype to test out SockJS w/Redis pub/sub for a scalable push channel

# First, install stuff

```sh
brew install node 
brew install redis
curl http://npmjs.org/install.sh | sh
npm install redis
npm install sockjs
npm install node-static
```

# Start servers

```sh
redis-server
node notification.js
```

# Load client pages

```sh
http://localhost:8000
```

# Send some messages

Either from each client or via the API

```sh
curl -X POST -d "uid=1234" -d "msg=hello to 1234" http://localhost:8001
curl -X POST -d "msg=hello to all" http://localhost:8001
```
