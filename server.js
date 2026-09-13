const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(express.json());
app.use(express.static(__dirname));

const rooms = new Map();
const clean = (v, max = 40) => String(v ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, max).toUpperCase();
const makeName = () => `WORLD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const makePassword = () => String(crypto.randomInt(100000, 1000000));

function getRoom(name) {
  return rooms.get(clean(name)) || null;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'WorldCall', rooms: rooms.size }));

app.post('/api/create-server', (req, res) => {
  let name = clean(req.body?.name);
  if (!name) name = makeName();
  if (rooms.has(name)) return res.status(409).json({ ok: false, error: 'Bu server nomi band. Boshqa nom tanlang.' });
  const password = makePassword();
  rooms.set(name, { password, clients: new Set(), updatedAt: Date.now() });
  res.json({ ok: true, serverName: name, password });
});

app.post('/api/check-server', (req, res) => {
  const name = clean(req.body?.name);
  const password = String(req.body?.password ?? '').trim();
  const room = getRoom(name);
  if (!room) return res.status(404).json({ ok: false, error: 'Server topilmadi.' });
  if (room.password !== password) return res.status(401).json({ ok: false, error: "Server paroli noto'g'ri." });
  if (room.clients.size >= 2) return res.status(409).json({ ok: false, error: "Server to'la. 2 kishi allaqachon ulangan." });
  res.json({ ok: true, serverName: name, people: room.clients.size });
});

io.on('connection', socket => {
  socket.on('join-server', ({ name, password } = {}) => {
    const serverName = clean(name);
    const pass = String(password ?? '').trim();
    const room = getRoom(serverName);
    if (!room) return socket.emit('join-result', { ok: false, error: 'Server topilmadi.' });
    if (room.password !== pass) return socket.emit('join-result', { ok: false, error: "Server paroli noto'g'ri." });
    if (room.clients.size >= 2 && !room.clients.has(socket.id)) return socket.emit('join-result', { ok: false, error: "Server to'la." });

    if (socket.data.room && socket.data.room !== serverName) leave(socket);
    const initiator = room.clients.size === 0;
    room.clients.add(socket.id);
    room.updatedAt = Date.now();
    socket.join(serverName);
    socket.data.room = serverName;
    socket.emit('join-result', { ok: true, serverName, initiator });
    if (!initiator) socket.to(serverName).emit('peer-joined');
  });

  socket.on('signal', ({ serverName, data } = {}) => {
    const roomName = clean(serverName);
    if (socket.data.room === roomName) socket.to(roomName).emit('signal', data);
  });
  socket.on('leave-server', () => leave(socket));
  socket.on('disconnect', () => leave(socket));

  function leave(sock) {
    const roomName = sock.data.room;
    if (!roomName) return;
    const room = rooms.get(roomName);
    if (room) {
      room.clients.delete(sock.id);
      room.updatedAt = Date.now();
      if (room.clients.size === 0) rooms.delete(roomName);
    }
    sock.to(roomName).emit('peer-left');
    sock.leave(roomName);
    sock.data.room = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`WorldCall running on port ${PORT}`));
