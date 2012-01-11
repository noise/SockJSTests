var http = require('http');
var sockjs = require('sockjs');
var redis = require('redis');
var node_static = require('node-static');

var REDIS_CHANNEL = 'sockjs';
var BROADCAST_MAGIC_USERNAME = '_all';

// get a redis connection
// need 2 clients as the subscriber is blocking, see https://github.com/mranney/node_redis
// TODO: reconnect on error
redisSubClient = redis.createClient();
redisPubClient = redis.createClient();
redisSubClient.on('error', function (err) {
    console.log('Error ' + err);
});
redisPubClient.on('error', function (err) {
    console.log('Error ' + err);
});

var sockjs_opts = {sockjs_url: 'http://cdn.sockjs.org/sockjs-0.1.min.js'};

// keep track of connected clients
var connections = new Array();
var connsByUsername = {};

// helper for logging
// TODO: make this a method on the connection object
function connId(conn) {
    return [conn.remoteAddress + ':' + conn.remotePort];
}

// send this to redis(and then we'll get it from our subscription and relay to clients
// we don't just broadcast directly since we'll have multiple sockjs servers and need everyone to get this
function broadcast(msg) {
    redisPubClient.publish(REDIS_CHANNEL, BROADCAST_MAGIC_USERNAME + ' ' + msg);
}

// create our server and setup handlers
var echo = sockjs.createServer(sockjs_opts);
echo.on('connection', function(conn) {
    connections.push(conn);
    console.log('open, ' + connId(conn));
    console.log('total conns: ' + connections.length);
    broadcast(connId(conn) + ' joined');

    // handle messages from clients
    conn.on('data', function(message) {
        // handle setting of username
        if (message.indexOf('/user') == 0) {
            conn.user = message.substring(message.indexOf(' ')+1, message.length); // todo: not safe
            connsByUsername[conn.user] = conn;
            console.log(connId(conn) + ' set user to ' + conn.user);
        }
        else {
            broadcast(conn.user + ' says ' + message);
        }
    });

    // on close, remove them from the list, broadcast change of presence
    conn.on('close', function() {
        console.log('closed, ' + connId(conn));
        var idx = connections.indexOf(conn); 
        if(idx!=-1) {
            connections.splice(idx, 1); 
            // TODO: the disco comes in after the reconn, and this kills our association
            if (conn.name != undefined) {
                connsByUsername[name] = undefined;
            }
            console.log('total conns: ' + connections.length);
            broadcast(connId(conn) + ' left');
        }
        else { 
            console.log('disconnected client not in connections list: ' + connId(conn));
        }
    });
});

// Static files server
var static_directory = new node_static.Server(__dirname);

// actually create the server and start listening
var server = http.createServer();

server.addListener('request', function(req, res) {
    try {
        if (req.url === '/') {
            //console.log('index: ' + req.headers.host);
            var redir =  'http://' + req.headers.host + '/static/';
            res.writeHead(302, {'Content-Type': 'text/plain', 'Location': redir});
            res.end();
        }
        else {
            static_directory.serve(req, res);
        }
    } catch(x) {
        console.log(x);
    }
});
server.addListener('upgrade', function(req,res){
    res.end();
});

echo.installHandlers(server, {prefix:'[/]echo'});
server.listen(8000, '0.0.0.0');


// subscribe to the pub/sub channel
redisSubClient.subscribe(REDIS_CHANNEL);
redisSubClient.on('message', function (channel, message) {
    console.log('redis channel ' + channel + ': ' + message);
    to = message.substring(0, message.indexOf(' '));
    console.log('to: ' + to);

    // send to specified user id or all connected clients
    if (to != '_all') {
        conn = connsByUsername[to];
        if (conn === undefined) {
            console.log('unknown user: ' + to);
        }
        else {
            conn.write(message.substring(message.indexOf(' '), message.length));
            console.log('user: ' + conn.user + ', send');
        }
    }
    else {
        // broadcast
        console.log('broadcast');
        for (idx in connections) {
            conn = connections[idx];
            conn.write(message.substring(message.indexOf(' '), message.length));
        }
    }
});

