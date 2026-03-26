// Player2PiP — Сигнальный сервер + API
// Player2PiP — Signaling server + API
// Player2PiP — Servidor de señalización + API

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат (в памяти) / Room storage (in-memory) / Almacén de salas (en memoria)
const rooms = new Map();
// Таймаут удаления пустой комнаты / Empty room destroy timeout / Tiempo de destrucción de sala vacía
const ROOM_TIMEOUT = 60 * 60 * 1000;

// ============ REST API ============

// Создать комнату / Create room / Crear sala
app.post('/api/rooms', (req, res) => {
  const roomId = uuidv4().slice(0, 8);
  rooms.set(roomId, {
    users: new Map(),
    hostId: null,
    createdAt: Date.now(),
    destroyTimer: null,
  });
  console.log(`Room ${roomId} created`);
  res.json({ roomId });
});

// Информация о комнате / Room info / Info de sala
app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'not found' });
  res.json({ roomId: req.params.id, usersCount: room.users.size, hasHost: !!room.hostId });
});

// Получить inline-скрипт хоста для вставки в консоль браузера
// Get inline host script for browser console injection
// Obtener script inline del host para inyectar en consola del navegador
app.get('/api/script/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (!rooms.has(roomId)) return res.status(404).json({ error: 'not found' });
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = proto + '://' + host;
  const wsUrl = (proto === 'https' ? 'wss' : 'ws') + '://' + host;
  res.json({ script: getHostScript(roomId, baseUrl, wsUrl) });
});

// Страница зрителя / Viewer page / Página del espectador
app.get('/room/:id', (req, res) => {
  if (!rooms.has(req.params.id)) return res.status(404).send('Room not found');
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ============ Скрипт хоста / Host script / Script del host ============
// Генерируется на сервере, выполняется в консоли браузера хоста.
// Захватывает видео/аудио со страницы и транслирует через WebRTC.
// Generated on server, executed in host's browser console.
// Captures video/audio from the page and streams via WebRTC.
// Generado en el servidor, ejecutado en la consola del navegador del host.
// Captura video/audio de la página y transmite vía WebRTC.

function getHostScript(roomId, baseUrl, wsUrl) {
  return `(function(){
if(window.__p2p){console.log('P2P already running');return}
window.__p2p=true;
var ROOM='${roomId}',WS_URL='${wsUrl}',BASE='${baseUrl}';
var ws,pcs={},stream;

// ICE серверы (STUN + TURN для NAT traversal)
// ICE servers (STUN + TURN for NAT traversal)
// Servidores ICE (STUN + TURN para traversal de NAT)
var ICE_SERVERS=[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'},
  {urls:'stun:stun2.l.google.com:19302'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}
];

// Поиск медиа-элементов на странице (включая iframe)
// Find media elements on page (including iframes)
// Buscar elementos multimedia en la página (incluyendo iframes)
function findMedia(){
  var els=[].slice.call(document.querySelectorAll('video,audio'));
  document.querySelectorAll('iframe').forEach(function(f){
    try{els=els.concat([].slice.call(f.contentDocument.querySelectorAll('video,audio')))}catch(e){}
  });
  return els;
}

// Захват медиа: captureStream + AudioContext (звук и хосту, и зрителю)
// Media capture: captureStream + AudioContext (audio for both host and viewer)
// Captura de medios: captureStream + AudioContext (audio para host y espectador)
async function startCapture(){
  stream=new MediaStream();

  var els=findMedia();
  if(els.length>0){
    var el=els[0];
    try{
      // Видео из captureStream / Video from captureStream / Video desde captureStream
      var ms=el.captureStream?el.captureStream():el.mozCaptureStream();
      if(ms){
        ms.getVideoTracks().forEach(function(t){stream.addTrack(t)});
        console.log('[P2P] Video captured from '+el.tagName);
      }
      // Аудио через AudioContext — разделяем: колонки хоста + стрим зрителю
      // Audio via AudioContext — split: host speakers + viewer stream
      // Audio vía AudioContext — dividir: altavoces del host + stream al espectador
      var ac=new (window.AudioContext||window.webkitAudioContext)();
      var source=ac.createMediaElementSource(el);
      source.connect(ac.destination);
      var streamDest=ac.createMediaStreamDestination();
      source.connect(streamDest);
      streamDest.stream.getAudioTracks().forEach(function(t){stream.addTrack(t)});
      console.log('[P2P] Audio: speakers + stream, tracks:',stream.getTracks().map(function(t){return t.kind}).join(', '));

      // Заглушка видео для audio-only элементов
      // Video placeholder for audio-only elements
      // Placeholder de video para elementos solo-audio
      if(!stream.getVideoTracks().length){
        var c=document.createElement('canvas');c.width=640;c.height=360;
        var ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,640,360);
        ctx.fillStyle='#888';ctx.font='24px sans-serif';ctx.textAlign='center';
        ctx.fillText('Audio only',320,180);
        var vs=c.captureStream(1);
        vs.getVideoTracks().forEach(function(t){stream.addTrack(t)});
      }
    }catch(e){console.log('[P2P] captureStream failed:',e.message);stream=null}
  }

  // Fallback: getDisplayMedia (Chrome tab sharing)
  if(!stream||!stream.getTracks().length){
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
      var tracks=stream.getTracks().map(function(t){return t.kind+':'+t.readyState});
      console.log('[P2P] getDisplayMedia tracks:',tracks.join(', '));
      if(!tracks.some(function(t){return t.indexOf('audio')===0})) console.warn('[P2P] No audio! In Chrome enable "Share tab audio"');
    }catch(e){
      console.error('[P2P] Capture failed:',e.message);
      window.__p2p=false;
      return;
    }
  }
  var btn=document.getElementById('p2p-start-btn');
  if(btn) btn.remove();

  // WebSocket сигналинг / WebSocket signaling / Señalización WebSocket
  ws=new WebSocket(WS_URL+'/ws?room='+ROOM+'&name=Host&role=host');
  ws.onopen=function(){
    console.log('[P2P] Connected. Viewer link:');
    console.log(BASE+'/room/'+ROOM);
    showUI();
  };
  ws.onmessage=function(e){
    var msg=JSON.parse(e.data);
    if(msg.type==='viewer-joined') addViewer(msg.viewerId);
    if(msg.type==='viewer-left'&&pcs[msg.viewerId]){pcs[msg.viewerId].close();delete pcs[msg.viewerId]}
    if(msg.type==='answer'&&msg.from&&pcs[msg.from])
      pcs[msg.from].setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:msg.sdp}));
    if(msg.type==='ice-candidate'&&msg.from&&pcs[msg.from]&&msg.candidate)
      pcs[msg.from].addIceCandidate(new RTCIceCandidate({candidate:msg.candidate,sdpMid:msg.sdpMid,sdpMLineIndex:msg.sdpMLineIndex}));
    if(msg.type==='control') handleControl(msg);
    if(msg.type==='users'){
      var v=msg.users.filter(function(u){return u.role==='viewer'});
      var el=document.getElementById('p2p-users');
      if(el) el.textContent=v.length?v.map(function(u){return u.name}).join(', '):'...';
    }
  };
  ws.onclose=function(){
    console.log('[P2P] Disconnected');
    var el=document.getElementById('p2p-dot');
    if(el) el.style.background='#ef4444';
  };
}

// Кнопка старта (нужен клик пользователя для getDisplayMedia)
// Start button (user click required for getDisplayMedia)
// Botón de inicio (se requiere clic del usuario para getDisplayMedia)
function showStartBtn(){
  var b=document.createElement('button');
  b.id='p2p-start-btn';
  b.textContent='\\u25B6 Start P2P Stream';
  b.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;padding:18px 36px;font-size:18px;font-weight:700;color:#fff;background:linear-gradient(135deg,#667eea,#764ba2);border:none;border-radius:14px;cursor:pointer;box-shadow:0 6px 25px rgba(102,126,234,.5);font-family:sans-serif';
  b.onclick=startCapture;
  document.body.appendChild(b);
  console.log('[P2P] Click the button on the page to start streaming');
}

showStartBtn();

// Создать WebRTC соединение для нового зрителя
// Create WebRTC connection for new viewer
// Crear conexión WebRTC para nuevo espectador
async function addViewer(viewerId){
  var pc=new RTCPeerConnection({iceServers:ICE_SERVERS});
  pcs[viewerId]=pc;
  stream.getTracks().forEach(function(t){pc.addTrack(t,stream)});
  pc.onicecandidate=function(e){
    if(e.candidate) ws.send(JSON.stringify({type:'ice-candidate',target:viewerId,candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex}));
  };
  pc.oniceconnectionstatechange=function(){console.log('[P2P] ICE:',pc.iceConnectionState)};
  pc.onconnectionstatechange=function(){console.log('[P2P] Connection:',pc.connectionState)};
  var offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({type:'offer',target:viewerId,sdp:pc.localDescription.sdp}));
}

// Обработка команд управления от зрителя (play/pause/seek/volume)
// Handle control commands from viewer (play/pause/seek/volume)
// Manejar comandos de control del espectador (play/pause/seek/volume)
function handleControl(msg){
  var els=findMedia();
  els.forEach(function(el){
    if(msg.action==='play') el.play().catch(function(){});
    if(msg.action==='pause') el.pause();
    if(msg.action==='seek'&&msg.time!==undefined) el.currentTime=msg.time;
    if(msg.action==='seek-rel'&&msg.value!==undefined) el.currentTime=Math.max(0,el.currentTime+msg.value);
    if(msg.action==='volume'&&msg.value!==undefined) el.volume=msg.value;
  });
}

// Мини-панель управления хоста / Host control mini-panel / Mini-panel de control del host
function showUI(){
  var d=document.createElement('div');
  d.id='p2p-panel';
  d.innerHTML='<div style="position:fixed;bottom:12px;right:12px;z-index:999999;background:#14141f;border:1px solid #333;border-radius:10px;padding:10px 14px;font-family:sans-serif;font-size:12px;color:#ccc;box-shadow:0 4px 15px rgba(0,0,0,.5);max-width:280px">'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span id="p2p-dot" style="width:8px;height:8px;border-radius:50%;background:#4ade80"></span><b style="color:#fff">P2P Stream</b></div>'
    +'<div id="p2p-users" style="font-size:11px;color:#888;margin-bottom:6px">...</div>'
    +'<input id="p2p-link" readonly value="'+BASE+'/room/'+ROOM+'" style="width:100%;padding:5px 8px;background:#1a1a2e;border:1px solid #333;border-radius:5px;color:#4ade80;font-size:11px;font-family:monospace;cursor:pointer" onclick="this.select();document.execCommand(\\'copy\\')">'
    +'</div>';
  document.body.appendChild(d);
}

})()`;
}

// ============ WebSocket сигналинг / WebSocket signaling / Señalización WebSocket ============
// Пересылает WebRTC offer/answer/ICE между хостом и зрителями.
// Relays WebRTC offer/answer/ICE between host and viewers.
// Retransmite WebRTC offer/answer/ICE entre host y espectadores.

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const roomId = params.get('room');
  const name = params.get('name') || 'Anon';
  const role = params.get('role') || 'viewer';

  if (!roomId) { ws.close(4000, 'room required'); return; }
  const room = rooms.get(roomId);
  if (!room) { ws.close(4001, 'room not found'); return; }

  if (room.destroyTimer) { clearTimeout(room.destroyTimer); room.destroyTimer = null; }

  const userId = uuidv4().slice(0, 6);
  room.users.set(userId, { ws, name, role });
  if (role === 'host') room.hostId = userId;

  console.log(`[${roomId}] ${name} (${role}) joined`);
  broadcastUsers(room);

  // Зритель пришёл — уведомить хоста / Viewer joined — notify host / Espectador entró — notificar al host
  if (role === 'viewer' && room.hostId) {
    const host = room.users.get(room.hostId);
    if (host && host.ws.readyState === 1)
      host.ws.send(JSON.stringify({ type: 'viewer-joined', viewerId: userId, name }));
  }
  // Хост пришёл — уведомить о существующих зрителях
  // Host joined — notify about existing viewers
  // Host entró — notificar sobre espectadores existentes
  if (role === 'host') {
    for (const [id, user] of room.users) {
      if (user.role === 'viewer' && user.ws.readyState === 1)
        ws.send(JSON.stringify({ type: 'viewer-joined', viewerId: id, name: user.name }));
    }
  }

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // Сигналинг: пересылка offer/answer/ice между host и viewer
    // Signaling: relay offer/answer/ice between host and viewer
    // Señalización: retransmitir offer/answer/ice entre host y espectador
    if (['offer', 'answer', 'ice-candidate'].includes(msg.type) && msg.target) {
      const target = room.users.get(msg.target);
      if (target && target.ws.readyState === 1) {
        msg.from = userId;
        target.ws.send(JSON.stringify(msg));
      }
    }

    // Управление от зрителя → хосту / Viewer control → host / Control del espectador → host
    if (msg.type === 'control' && room.hostId) {
      const host = room.users.get(room.hostId);
      if (host && host.ws.readyState === 1) {
        host.ws.send(JSON.stringify(msg));
      }
    }
  });

  ws.on('close', () => {
    const wasHost = room.hostId === userId;
    room.users.delete(userId);
    if (wasHost) {
      room.hostId = null;
      for (const [, u] of room.users)
        if (u.ws.readyState === 1) u.ws.send(JSON.stringify({ type: 'host-left' }));
    } else if (room.hostId) {
      const host = room.users.get(room.hostId);
      if (host && host.ws.readyState === 1)
        host.ws.send(JSON.stringify({ type: 'viewer-left', viewerId: userId }));
    }
    console.log(`[${roomId}] ${name} left`);
    broadcastUsers(room);

    // Авто-удаление пустой комнаты / Auto-delete empty room / Auto-eliminar sala vacía
    if (room.users.size === 0) {
      room.destroyTimer = setTimeout(() => {
        if (rooms.has(roomId) && rooms.get(roomId).users.size === 0) {
          rooms.delete(roomId); console.log(`Room ${roomId} destroyed`);
        }
      }, ROOM_TIMEOUT);
    }
  });
});

// Рассылка списка пользователей / Broadcast user list / Difundir lista de usuarios
function broadcastUsers(room) {
  const msg = JSON.stringify({
    type: 'users',
    users: [...room.users.values()].map(u => ({ name: u.name, role: u.role })),
    count: room.users.size,
  });
  for (const [, u] of room.users) if (u.ws.readyState === 1) u.ws.send(msg);
}

const PORT = process.env.PORT || 30000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
