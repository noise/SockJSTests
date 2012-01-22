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
node sockjs-node.js
```

# Optionally start the HTTP sending API server
```sh
redis-server
node notification-api.js
```


# Load client pages

```sh
http://localhost:8000
```

# Send some messages

Either from each client or via redis-cli:

```sh
redis-cli
publish sockjs "_all broadcast to all users"
publish sockjs "foo1 private message for foo1"
```

Or via the API
```sh
curl -X POST -d "uid=1234" -d "msg=hello to 1234" http://localhost:8001
curl -X POST -d "msg=hello to all" http://localhost:8001
```