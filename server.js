const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  transports: ['websocket', 'polling']
});

app.use(express.static(__dirname));
app.get('/health', (req, res) => res.json({ ok: true, service: 'WorldCall', time: Date.now() }));

const rooms = new Map();

function clean(value, max = 80) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeName(value) {
  return clean(value, 40).replace(/[^a-zA-Z0-9_-]/g, '-').toUpperCase();
}

function makeServerName() {
  return `WORLD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function makePassword() {
  return String(crypto.randomInt(100000, 1000000));
}

function removeSocketFromRoom(socket) {
  const roomName = socket.data.room;
  if (!roomName) return;
  const room = rooms.get(roomName);
  if (room) {
    room.clients.delete(socket.id);
    room.updatedAt = Date.now();
    if (room.clients.size === 0) rooms.delete(roomName);
  }
  socket.to(roomName).emit('peer-left');
  socket.leave(roomName);
  socket.data.room = null;
}

io.on('connection', socket => {
  socket.on('create-server', ({ name } = {}) => {
    let serverName = normalizeName(name);
    if (!serverName) serverName = makeServerName();

    if (rooms.has(serverName)) {
      socket.emit('server-created', {
        ok: false,
        error: 'Bu server nomi band. Boshqa nom tanlang.'
      });
      return;
    }

    const password = makePassword();
    rooms.set(serverName, {
      password,
      clients: new Set(),
      updatedAt: Date.now()
    });

    socket.emit('server-created', {
      ok: true,
      serverName,
      password
    });
  });

  socket.on('join-server', ({ name, password } = {}) => {
    const serverName = normalizeName(name);
    const pass = clean(password, 30);
    const room = rooms.get(serverName);

    if (!serverName || !room) {
      socket.emit('join-result', { ok: false, error: 'Server topilmadi.' });
      return;
    }

    if (room.password !== pass) {
      socket.emit('join-result', { ok: false, error: 'Parol noto‘g‘ri.' });
      return;
    }

    if (room.clients.size >= 2 && !room.clients.has(socket.id)) {
      socket.emit('join-result', { ok: false, error: 'Serverda 2 kishi allaqachon bor.' });
      return;
    }

    if (socket.data.room && socket.data.room !== serverName) {
      removeSocketFromRoom(socket);
    }

    const wasEmpty = room.clients.size === 0;
    room.clients.add(socket.id);
    room.updatedAt = Date.now();
    socket.join(serverName);
    socket.data.room = serverName;

    socket.emit('join-result', {
      ok: true,
      serverName,
      initiator: wasEmpty
    });

    if (!wasEmpty) socket.to(serverName).emit('peer-joined');
  });

  socket.on('signal', ({ serverName, data } = {}) => {
    const roomName = normalizeName(serverName);
    if (!socket.data.room || socket.data.room !== roomName) return;
    socket.to(roomName).emit('signal', data);
  });

  socket.on('leave-server', () => removeSocketFromRoom(socket));

  socket.on('disconnect', () => removeSocketFromRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WorldCall server running on port ${PORT}`);
});
