/**
This is the message queuing daemon for the notification system. It exposes a basic HTTP API for queueing notification messages for a give client.

Messages are added to a Redis ZSET for each user id. The set is truncated to HISTORY_LEN messages on each addition, and has a TTL for the entire set of HISTORY_TTL seconds.

On connection (in pnotification.js), server will send all available history to the client and start sending then incoming real-time messages from the pub-sub channel. Clients will be responsible for de-duping already receieved messages based on the message timestamps.

USAGE: 

Server:
  node ./notification_api.js
Client API to queue a message:
  curl -X POST -d "uid=1234" -d "msg=hello" http://localhost:8001

*/

var sys = require('sys')
var url = require('url')
var express = require('express');
var redis = require('redis');

var app = express.createServer();
app.use(express.bodyParser());

var HISTORY_LEN = 5;
var HISTORY_TTL = 20; // seconds
var REDIS_CHANNEL = 'sockjs';

redisClient = redis.createClient();
redisClient.on('error', function (err) {
    console.log('Error ' + err);
});

app.post('/', function(req, res){
    console.log(req.body);
    var uid = req.body.uid;
    var msg = req.body.msg;
    console.log('uid: ' + uid);
    console.log('msg: ' + msg);

    var ts =  new Date().getTime()
    req.body.ts = ts;
    message = sys.inspect(req.body)
    console.log(message);

    // TODO: screen inputs 
    redisClient.zadd('nl:' + uid, ts, message);
    redisClient.expire('nl:' + uid, HISTORY_TTL);
    redisClient.zcard('nl:' + uid, function(err, len) {
        if (err) {
            return console.error("error response - " + err);
        }
        if (len > HISTORY_LEN) {
            console.log('set longer than ' + HISTORY_LEN + ', trimming');
            redisClient.zremrangebyrank('nl:' + uid, 0, len - (HISTORY_LEN + 1));
        }
    });

    // pub to channel
    redisClient.publish(REDIS_CHANNEL, message);
    res.send('message queued\n');
});

app.listen(8001);


