const express = require('express');
const msal = require('@azure/msal-node');
//Server dependencies
const app = express()
const path = require('path')
//For SSL
var https = require('https')
var forge = require('node-forge');
forge.options.usePureJavaScript = true;
var pki = forge.pki;
var keys = pki.rsa.generateKeyPair(2048);
var cert = pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear()+1);
var attrs = [
    {name:'commonName',value:'localhost'}
   ,{name:'countryName',value:'US'}
   ,{shortName:'ST',value:'Virginia'}
   ,{name:'localityName',value:'Blacksburg'}
   ,{name:'organizationName',value:'Test'}
   ,{shortName:'OU',value:'Test'}
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey);
var pem_pkey = pki.privateKeyToPem(keys.privateKey);
var pem_cert = pki.certificateToPem(cert);
console.log(pem_pkey);
console.log(pem_cert);
//SSL works only in port 443 generally
const SERVER_PORT = process.env.PORT || 443;
const server = https.createServer({
    key: pem_pkey,
    cert: pem_cert
}, app).listen(SERVER_PORT);
const io = require('socket.io')(server)

//Variables
var username, sockets=[], roomId, nextRoomId = 1, meeting_participants = {};
const { Client } = require('pg')
const client = new Client ({
    user: 'postgres',
    password: 'Saraswathi123#',
    host: 'localhost',
    database: 'postgres',
    port: 5432,
})
client.connect(function(err) {
    if (err) throw err;
    console.log("Postgres connected!");
});

//Authentication
const REDIRECT_URI = "https://localhost/index.html";

// Before running the sample, you will need to replace the values in the config, 
// including the clientSecret
const config = {
    auth: {
        clientId: "ac1412ba-486c-4a6c-8ae4-ed8b64d63bbd",
        authority: "https://login.microsoftonline.com/common",
        clientSecret: "_D2_qaOUGf~opoy6-~F~UD~Uh2R9ch6ik-"
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Verbose,
        }
    }
};

// Create msal application object
const pca = new msal.ConfidentialClientApplication(config);

// Create Express App and Routes

app.get('/', (req, res) => {
    const authCodeUrlParameters = {
        scopes: ["user.read"],
        redirectUri: REDIRECT_URI,
    };

    // get url to sign user in and consent to scopes needed for application
    pca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
        res.redirect(response);
    }).catch((error) => console.log(JSON.stringify(error)));
});

app.get('/index.html', (req, res) => {
    const tokenRequest = {
        code: req.query.code,
        scopes: ["user.read"],
        redirectUri: REDIRECT_URI,
    };

    pca.acquireTokenByCode(tokenRequest).then((response) => {
        console.log("\nResponse Username: ")
        console.log(response.account.username);
        username = response.account.username;
        res.sendFile(path.join(__dirname, 'public/index_bootstrap.html'));
    }).catch((error) => {
        console.log(error);
        res.status(500).send(error);
    });
});

app.get("/AdminData", function(req, response){    
	client
        .query('SELECT * from  meeting')
        .then(res => {
                console.log(JSON.stringify(res.rows))
                return response.send(res.rows)
            })
        .catch(e => console.error(e.stack))
});

app.get("/admin", function(req, response){
    return response.sendFile(path.join(__dirname, '/public/Admin.html'))
});

//Server.js
app.use('/', express.static('public'))

io.on('connection', (socket) => {
    //Push socket into sockets to keep track of users
    sockets[username] = socket;
    console.log(username + ' ' + sockets[username].id + ' pushed');

    //Emit socket's username to the particular client for its reference
    socket.emit('send_username', username)

    //Whenever a new client joins, emit to all existing clients
    //that a new client has joined (Update dropdown on client side)
    socket.broadcast.emit('new_client_connect', username)

    //When one user is inviting another user for call, send an invite to the other user
    socket.on('user_inviting_call', function(callee, caller) {
        //callee -> person called; caller -> person calling;
        console.log(callee + ' is calling ' + caller + ' for a call')
        socket.to(sockets[caller].id).emit('call_invite_incoming', callee);
    });

    //When one user is inviting another user for chat, send an invite to the other user
    socket.on('user_inviting_chat', function(callee, caller) {
        //callee -> person called; caller -> person calling
        console.log(callee + ' is calling ' + caller + ' for a chat')
        socket.to(sockets[caller].id).emit('chat_invite_incoming', callee);
    });

    //Send all existing client usernames to populate the dropdown of a client when joining
    socket.on('get_user_list', function() {
        socket.emit('sending_user_list', Object.keys(sockets));
    });

    //Prompt all clients to remove a user from their dropdown when he/she logs out
    socket.on('disconnect', function() {
        Object.keys(sockets).forEach((key) => {
            if(sockets[key]===socket) {
                console.log(key + ' disconnected')
                socket.broadcast.emit('user_disconnected', key)
                return;
            }
        })
    });

    socket.on('join', function(username) {
        roomId = nextRoomId;
        const roomClients = io.sockets.adapter.rooms[roomId] || { length: 0 }
        const numberOfClients = roomClients.length
        // These events are emitted only to the sender socket.
        if (numberOfClients == 0) {
            console.log(`Creating room ${roomId} and emitting room_created socket event`)
            socket.join(roomId)
            meeting_participants[roomId] = {}
            meeting_participants[roomId]['initiator'] = username;
            console.log(meeting_participants);
            socket.emit('room_created', roomId)
        }
        else if (numberOfClients == 1) {
            console.log(`Joining room ${roomId} and emitting room_joined socket event`)
            socket.join(roomId)
            meeting_participants[roomId]['participant'] = username;
            console.log(meeting_participants);
            socket.emit('room_joined', roomId)
            const text = 'INSERT INTO meeting(id, initiator, participant,created_at,ended_at,duration) VALUES($1, $2, $3,$4,$5, $6) RETURNING *'
            var d = new Date();
            var d1 = d.toString();
	        var values = [roomId, meeting_participants[roomId]['participant'], meeting_participants[roomId]['initiator'], d1, d1, '0'];
            // promise
            client
                .query(text, values)
                .then(res => {
                    console.log(res.rows[0])
                    // { name: 'brianc', email: 'brian.m.carlson@gmail.com' }
                })
                .catch(e => console.error(e.stack))
            nextRoomId++; //increment running index of room
        }
        else {
            console.log(`Can't join room ${roomId}, emitting full_room socket event`)
            socket.emit('full_room', roomId)
        }
    });

    socket.on('leave', (roomId) => {
        console.log(`Leaving room ${roomId}`)
        const text1 = 'update meeting set ended_at = ($1), duration = ($2) where id=($3) RETURNING *';
        const text2 = 'select created_at from meeting where id= ($1) '
        var created = null;
	    client.query(text2,[roomId]).then(res => {
		    created = res.rows[0].created_at
		    console.log("From inner select" + res.rows[0].created_at)
		    var d2 = new Date(created);
            var d = new Date();
            var duration = d-d2
            var dur = duration.toString();
            console.log("value  " + duration + "   " + dur + "  " + created);
            var values = [d, dur, roomId];
		    // promise
	        client
	            .query(text1, values)
	            .then(res => {
		        console.log(res.rows[0])
                // { name: 'brianc', email: 'brian.m.carlson@gmail.com' }
            })
                .catch(e => console.error(e.stack))
		})
	    .catch(e => console.error(e.stack))
        socket.leave(roomId)
    });

    socket.on('call_accepted', function(callee, caller) {
        socket.to(sockets[caller].id).emit('call_accepted', callee)
    });

    socket.on('call_not_accepted', function(callee, caller) {
        socket.to(sockets[caller].id).emit('call_not_accepted', callee)
    });

    socket.on('chat_accepted', function(callee, caller) {
        socket.to(sockets[caller].id).emit('chat_accepted', callee)
    });

    socket.on('chat_not_accepted', function(callee, caller) {
        socket.to(sockets[caller].id).emit('chat_not_accepted', callee)
    })

    socket.on('chat_from_client', function(message, caller) {
        socket.to(sockets[caller].id).emit('chat_from_server', message);
    })

    // These events are emitted to all the sockets connected to the same room except the sender.
    socket.on('start_call', (roomId) => {
        console.log(`Broadcasting start_call event to peers in room ${roomId}`)
        socket.broadcast.to(roomId).emit('start_call')
    })
    socket.on('webrtc_offer', (event) => {
        console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp)
    })
    socket.on('webrtc_answer', (event) => {
        console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp)
    })
    socket.on('webrtc_ice_candidate', (event) => {
        console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
        socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event)
    })
})