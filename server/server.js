const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Rooms: Map<roomId, { host: WebSocket | null, viewer: WebSocket | null }>
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

// All routes serve the viewer page (client-side routing via URL)
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

wss.on('connection', (ws) => {
  ws._roomId = null;
  ws._role = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create-room': {
        const roomId = crypto.randomUUID().slice(0, 8);
        rooms.set(roomId, { host: ws, viewer: null });
        ws._roomId = roomId;
        ws._role = 'host';
        ws.send(JSON.stringify({ type: 'room-created', roomId }));
        break;
      }

      case 'join-room': {
        const room = rooms.get(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        if (room.viewer) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }
        room.viewer = ws;
        ws._roomId = msg.roomId;
        ws._role = 'viewer';
        ws.send(JSON.stringify({ type: 'room-joined', roomId: msg.roomId }));
        if (room.host && room.host.readyState === 1) {
          room.host.send(JSON.stringify({ type: 'viewer-joined' }));
        }
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        const room = rooms.get(ws._roomId);
        if (!room) return;
        const target = ws._role === 'host' ? room.viewer : room.host;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify(msg));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws._roomId) return;
    const room = rooms.get(ws._roomId);
    if (!room) return;

    if (ws._role === 'host') {
      if (room.viewer && room.viewer.readyState === 1) {
        room.viewer.send(JSON.stringify({ type: 'host-disconnected' }));
      }
      rooms.delete(ws._roomId);
    } else if (ws._role === 'viewer') {
      room.viewer = null;
      if (room.host && room.host.readyState === 1) {
        room.host.send(JSON.stringify({ type: 'viewer-disconnected' }));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`player2pip signaling server running on port ${PORT}`);
});
