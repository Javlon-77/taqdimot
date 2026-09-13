const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname));
app.get('/health', (req, res) => res.json({ ok: true, service: 'WorldCall' }));

// In-memory server registry. A room is intentionally limited to two people.
const rooms = new Map();

function clean(value, max = 80) {
  return String(value || '').trim().slice(0, max);
}

function makeServerName() {
  return `WORLD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function makePassword() {
  return String(crypto.randomInt(100000, 1000000));
}

function roomState(name) {
  return rooms.get(name);
}

function ensureRoomAlive(name) {
  const r = rooms.get(name);
  if (!r) return null;
  if (Date.now() - r.updatedAt > 6 * 60 * 60 * 1000 && r.clients.size === 0) {
    rooms.delete(name);
    return null;
  }
  return r;
}

io.on('connection', socket => {
  socket.on('create-server', ({ name }) => {
    let serverName = clean(name, 40).replace(/[^a-zA-Z0-9_-]/g, '-').toUpperCase();
    if (!serverName) serverName = makeServerName();

    if (rooms.has(serverName)) {
      socket.emit('server-created', { ok: false, error: 'Bu server nomi band. Boshqa nom tanlang.' });
      return;
    }

    const password = makePassword();
    rooms.set(serverName, {
      password,
      clients: new Set(),
      updatedAt: Date.now()
    });

    socket.emit('server-created', { ok: true, serverName, password });
  });

  socket.on('join-server', ({ name, password }) => {
    const serverName = clean(name, 40).toUpperCase();
    const pass = clean(password, 30);
    const room = ensureRoomAlive(serverName);

    if (!room) {
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

    const wasEmpty = room.clients.size === 0;
    room.clients.add(socket.id);
    room.updatedAt = Date.now();
    socket.join(serverName);
    socket.data.room = serverName;

    socket.emit('join-result', { ok: true, serverName, initiator: wasEmpty });
    if (!wasEmpty) socket.to(serverName).emit('peer-joined');
  });

  socket.on('signal', ({ serverName, data }) => {
    const room = socket.data.room;
    if (!room || room !== clean(serverName, 40).toUpperCase()) return;
    socket.to(room).emit('signal', data);
  });

  socket.on('leave-server', () => {
    const room = socket.data.room;
    if (!room) return;
    const state = roomState(room);
    if (state) {
      state.clients.delete(socket.id);
      state.updatedAt = Date.now();
      if (state.clients.size === 0) rooms.delete(room);
    }
    socket.leave(room);
    socket.to(room).emit('peer-left');
    socket.data.room = null;
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;
    const state = roomState(room);
    if (state) {
      state.clients.delete(socket.id);
      state.updatedAt = Date.now();
      if (state.clients.size === 0) rooms.delete(room);
    }
    socket.to(room).emit('peer-left');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WorldCall server running on ${PORT}`));
