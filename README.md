First, install stuff:
brew install node 
brew install redis
curl http://npmjs.org/install.sh | sh
npm install redis
npm install sockjs

Then start redis server and our sockjs server:
redis-server
node sockjs-node.js

Then load up the client page in 2 browsers:
open sockjs.html

Then send some messages:
redis-cli
publish sockjs "_all broadcast to all users"
publish sockjs "foo1 private message for foo1"

