/*global console, $, SockJS */
/* because I'm not abusing ++ */
/*jslint plusplus:true */
var MAX_RECONNS = 5;
var sock;
var user;
var reconnTimer;
var reconnAttempts = 0;

function out(msg) {
    'use strict';
    console.log(msg);
    $("#out").append(msg + "\n");
}
function clearOut() {
    'use strict';
    $("#out").text("");
}

function sendChat() {
    'use strict';
    var msg = {};
    msg.type = 'chat';
    msg.msg = $("#msg").val();

    sock.send(JSON.stringify(msg));
    out('-> ' + JSON.stringify(msg));
}

function setUser() {
    'use strict';
    var msg = {};
    msg.type = 'uid';
    msg.msg = $("#user").val();
    sock.send(JSON.stringify(msg));
    out('-> ' + JSON.stringify(msg));
}

function kill() {
    'use strict';
    sock.close();
}

function connect() {
    'use strict';
    out('== connect...');
    clearTimeout(reconnTimer);
    reconnAttempts++;
    sock = new SockJS('/channel');
    sock.onopen = function () {
        out('== open');
        reconnAttempts = 0;
        setUser(user);
    };
    sock.onmessage = function (e) {
        // TODO: catch errs
        out('<- ' + e.data);
        var msg = JSON.parse(e.data);
    };
    sock.onclose = function () {
        console.log('close');
        if (reconnAttempts < MAX_RECONNS) {
            reconnTimer = setInterval(function () {
                try {
                    connect();
                } catch (x) {
                }
            }, 1000);
        } else {
            out('== max reconnect tries (' + MAX_RECONNS + ') exhausted, giving up.');
        }
    };
}

connect();
