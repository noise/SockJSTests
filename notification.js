/* standard exceptions for node.js */
/*jslint node: true nomen: true */
/**
This node server handles the following functions:

* / : index html page
* /channel: SockJS websocket channel
* /notifications: POST API for queueing messages
* /static/ : static files

The notifications API exposes a basic HTTP API for queueing
notification messages for a given client. Messages are added to a
Redis ZSET for each user id. The set is truncated to HISTORY_LEN
messages on each addition, and has a TTL for the entire set of
HISTORY_TTL seconds. On websocket connection, the server will
send all available history to the client and start sending then
incoming real-time messages from the pub-sub channel. Clients will be
responsible for de-duping already receieved messages based on the
message timestamps.

USAGE: 

Server:
  node ./notification.js

Client API to queue a message:
  curl -X POST -d "uid=1234" -d "msg=hello" http://localhost:8000
*/

var sys = require('sys');
var url = require('url');
var net = require('net');
var http = require('http');
var sockjs = require('sockjs');
var node_static = require('node-static');
var express = require('express');
var redis = require('redis');

var REDIS_CHANNEL = 'sockjs';
var MSG_TYPE_UID = 'uid';
var MSG_TYPE_CHAT = 'chat';
var HISTORY_LEN = 5;
var HISTORY_TTL = 20; // seconds

// need 2 Redis clients as the subscriber is blocking, see https://github.com/mranney/node_redis
// TODO: reconnect on redis error
var redisSubClient = redis.createClient();
var redisPubClient = redis.createClient();
redisSubClient.on('error', function (err) {
    'use strict';
    console.log('Error ' + err);
});
redisPubClient.on('error', function (err) {
    'use strict';
    console.log('Error ' + err);
});

var sockjs_opts = {sockjs_url: 'http://cdn.sockjs.org/sockjs-0.1.min.js'};

// keep track of connected clients
var connections = [];
var connsByUsername = {};

// helper for logging
// TODO: make this a method on the connection object
function connId(conn) {
    'use strict';
    return [conn.remoteAddress + ':' + conn.remotePort];
}

// send this to redis(and then we'll get it from our subscription and relay to clients
// we don't just broadcast directly since we'll have multiple sockjs servers and need everyone to get this
function broadcast(msg) {
    'use strict';
    console.log('-> (redis pub) ' + msg);
    redisPubClient.publish(REDIS_CHANNEL, msg);
}

// create our server and setup handlers
var echo = sockjs.createServer(sockjs_opts);
echo.on('connection', function (conn) {
    'use strict';
    connections.push(conn);
    console.log('open, ' + connId(conn));
    console.log('total conns: ' + connections.length);
    var msg = {};
    msg.msg = connId(conn) + ' joined';
    msg.ts = new Date().getTime();
    console.log('-> (redis pub)' + JSON.stringify(msg));
    broadcast(JSON.stringify(msg));


    // handle messages from clients
    conn.on('data', function (messageStr) {
        try {
            msg = JSON.parse(messageStr);
        }
        catch (x) {
            console.log('bad message from client: ' + messageStr);
            return;
        }

        if (msg.type !== undefined) {
            switch (msg.type) {
            case MSG_TYPE_UID:
                // handle setting of username
                // TODO: authentication
                // TODO: validate input constraints
                conn.uid = msg.msg;
                connsByUsername[conn.uid] = conn;
                console.log(connId(conn) + ' set user to ' + conn.uid);

                // send their history
                redisPubClient.zrange('nl:' + conn.uid, 0, 10, function (err, replies) {
                    console.log('got hist for ' + conn.uid + ': ' + sys.inspect(replies));
                    if (err) {
                        return console.error("error response - " + err);
                    }
                    replies.forEach(function (reply, i) {
                        console.log("    " + i + ": " + reply);
                        conn.write(reply);
                    });
                });
                break;
            case MSG_TYPE_CHAT:
                console.log('<- ' + JSON.stringify(msg));
                msg.from = conn.uid;
                broadcast(JSON.stringify(msg));
                break;
            default:
                console.log('unknown message type from ' + connId(conn));
                break;
            }
        }
    });

    // on close, remove them from the list, broadcast change of presence
    conn.on('close', function () {
        console.log('closed, ' + connId(conn));
        var idx, msg = {};
        idx = connections.indexOf(conn); 
        if (idx !== -1) {
            connections.splice(idx, 1); 
            // TODO: the disco comes in after the reconn, and this kills our association
            if (conn.name !== undefined) {
                connsByUsername[conn.name] = undefined;
            }
            console.log('total conns: ' + connections.length);
            //msg = {};
            msg.msg = connId(conn) + ' left';
            msg.ts = new Date().getTime();
            broadcast(JSON.stringify(msg));      
        } else { 
            console.log('disconnected client not in connections list: ' + connId(conn));
        }
    });
});

// express server for REST API
var server = express.createServer();
server.use(express.bodyParser());

// Static files server
var static_directory = new node_static.Server(__dirname);

// actually create the server and start listening
//var server = http.createServer();

server.post('/notifications', function (req, res) {
    'use strict';
    console.log('express req listener');

    var ts, msg, uid, message;
    uid = req.body.uid;
    msg = req.body.msg;
    ts =  new Date().getTime();
    req.body.ts = ts;
    message = JSON.stringify(req.body);
    console.log(req.socket.remoteAddress + ' queued: ' + message);

    // TODO: screen inputs 
    // TODO: can we do this in a non-blocking manner?
    redisPubClient.zadd('nl:' + uid, ts, message);
    redisPubClient.expire('nl:' + uid, HISTORY_TTL);
    redisPubClient.zcard('nl:' + uid, function (err, len) {
        if (err) {
            return console.error("error response - " + err);
        }
        if (len > HISTORY_LEN) {
            console.log('set longer than ' + HISTORY_LEN + ', trimming');
            redisPubClient.zremrangebyrank('nl:' + uid, 0, len - (HISTORY_LEN + 1));
        }
    });

    // pub to channel
    redisPubClient.publish(REDIS_CHANNEL, message);
    res.send('message queued, ts: ' + ts + '\n');
});

server.get('/', function (req, res) {
    'use strict';
    try {
        var redir =  'http://' + req.headers.host + '/static/';
        res.writeHead(302, {'Content-Type': 'text/plain', 'Location': redir});
        res.end();
    } catch(x) {
        console.log(x);
    }
});

server.get('/static/*', function (req, res) {
    'use strict';
    static_directory.serve(req, res);
});

server.addListener('upgrade', function (req,res){
    'use strict';
    res.end();
});

echo.installHandlers(server, {prefix:'[/]channel'});
server.listen(8000, '0.0.0.0');


// subscribe to the pub/sub channel
redisSubClient.subscribe(REDIS_CHANNEL);
redisSubClient.on('message', function (channel, message) {
    'use strict';
    var msg = '', to, conn, idx, i;

    console.log('<- (redis sub) ' + message);
    try {
        msg = JSON.parse(message);
    }
    catch (x) {
        console.log('!! parse fail: ' + sys.inspect(x));
        return;
    }

    to = msg.uid;

    // send to specified user id
    if (to !== undefined) {
        conn = connsByUsername[to];
        if (conn === undefined) {
            console.log('!! unknown user: ' + to);
        }
        else {
            conn.write(JSON.stringify(msg));
            console.log('-> (' + conn.uid + ') ' + msg.msg);
        }
    }
    // broadcast
    else {
        console.log('-> (broadcast) ' + JSON.stringify(msg));
        for (idx in connections) { 
            if (connections.hasOwnProperty(idx)) {
                conn = connections[idx];
                if (conn.uid !== msg.from) { // don't echo to sender
                    conn.write(JSON.stringify(msg));
                }
            }
        }
    }
});
