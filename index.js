const express = require('express');
const compression = require('compression')
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 50 * 1024 * 1024,
});

app.use(compression())
app.set('views', __dirname + '/views');
app.use(express.static('public'));
app.set('view engine', 'ejs');

let rooms = [];

app.get('/', (req, res) => {
    res.render('index', {roomId: null});
})

app.get('/c/:roomId?', (req, res) => {
    if(req.params.roomId != null && rooms.includes(req.params.roomId.toString()))
        res.render("index", { roomId: req.params.roomId });
    else
        res.redirect('/');
});

io.on('connection', (socket) => {
    socket.on("createRoom", () => {
        let roomId = GenerateRandomRoomId();
        while(rooms.includes(roomId))
        {
            roomId = GenerateRandomRoomId();
        }
        rooms.push(roomId);

        //Callback to client that room has been created and assigned to his socket
        socket.join(roomId);
        socket.roomId = roomId;
        socket.emit("createRoomCallback", {roomId: roomId});
        
        DeviceDiscovery()
    })

    socket.on('joinRoom', (msg) => {
        socket.join(msg.roomId);
        socket.roomId = msg.roomId;

        let socketsInRoom = Array.from(io.sockets.adapter.rooms.get(msg.roomId) || []);
        io.to(msg.roomId).emit('joinRoomCallback', { socketsInRoom: socketsInRoom });

        DeviceDiscovery()
    })

    socket.on("upload", (info, callback) => {
        if(info.deviceList.length == 0)
            socket.to(socket.roomId).emit('receiveFile', info);
        else
        {
            Array.from(info.deviceList).forEach((socketId) => {
                io.to(socketId).emit('receiveFile', info);
            })    
        }
    });

    socket.on('disconnect', () => {
        //Delete room if everyone left
        io.in(socket.roomId).allSockets().then(async res => {
            if (res.size == 0) {
                let thisRoomIndex = rooms.indexOf(socket.roomId)
                if(thisRoomIndex != -1)
                    rooms.splice(rooms.indexOf(socket.roomId), 1)
            }
            else
            {
                //Send message to update devices list in room
                let socketsInRoom = Array.from(io.sockets.adapter.rooms.get(socket.roomId) || []);
                io.to(socket.roomId).emit('joinRoomCallback', { socketsInRoom: socketsInRoom });
            }
        })
        DeviceDiscovery()
    });
})

function DeviceDiscovery(){
    let connectedClients = io.of('/').sockets;

    connectedClients.forEach(client => {
        let dicoveredClients = [];
        connectedClients.forEach(client2 => {
            if(client.handshake.address == client2.handshake.address && client.roomId != client2.roomId){
                dicoveredClients.push(client2.id)
            }
        })
        io.to(client.id).emit('discoverCallback', {discovered: dicoveredClients})
    });
}

function GenerateRandomRoomId() {
    let randomNum = Math.floor(Math.random() * 100000000);
    return randomNum.toString();
}

http.listen(3000, () => {
    console.log('Serwer nasłuchuje na porcie 3000');
});