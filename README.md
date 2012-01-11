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
