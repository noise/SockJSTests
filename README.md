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
open sockjs.html
```

# Send some messages

```sh
redis-cli
publish sockjs "_all broadcast to all users"
publish sockjs "foo1 private message for foo1"
```
