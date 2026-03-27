(() => {
  const statusEl = document.getElementById('status');
  const videoEl = document.getElementById('remote-video');
  const overlayEl = document.getElementById('input-overlay');

  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  // Extract roomId from URL: /room/<roomId>
  const pathParts = window.location.pathname.split('/');
  const roomIdx = pathParts.indexOf('room');
  const roomId = roomIdx !== -1 ? pathParts[roomIdx + 1] : null;

  if (!roomId) {
    statusEl.textContent = 'Нет ID комнаты в URL';
    statusEl.classList.add('error');
    return;
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || '';
  }

  setStatus(`Подключение к комнате ${roomId}...`);

  // WebSocket signaling
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProto}//${location.host}`);

  let pc = null;
  let dataChannel = null;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join-room', roomId }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'room-joined':
        setStatus('Ожидание хоста...');
        break;

      case 'error':
        setStatus(msg.message, 'error');
        break;

      case 'offer':
        handleOffer(msg);
        break;

      case 'ice-candidate':
        if (pc && msg.candidate) {
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
        break;

      case 'host-disconnected':
        setStatus('Хост отключился', 'error');
        if (pc) pc.close();
        break;
    }
  };

  ws.onclose = () => {
    setStatus('Соединение с сервером потеряно', 'error');
  };

  async function handleOffer(msg) {
    setStatus('Устанавливаем соединение...');

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate }));
      }
    };

    pc.ontrack = (e) => {
      videoEl.srcObject = e.streams[0];
      setStatus('Подключено', 'connected');
    };

    pc.ondatachannel = (e) => {
      dataChannel = e.channel;
      dataChannel.onopen = () => setupInputCapture();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('Соединение потеряно', 'error');
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
  }

  // Input capture and relay
  function setupInputCapture() {
    let lastMouseMove = 0;

    function getVideoCoords(e) {
      const rect = videoEl.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height
      };
    }

    function send(msg) {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(msg));
      }
    }

    overlayEl.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMouseMove < 16) return; // ~60fps throttle
      lastMouseMove = now;
      const coords = getVideoCoords(e);
      send({ type: 'input', event: 'mousemove', ...coords });
    });

    for (const evt of ['mousedown', 'mouseup', 'click', 'dblclick']) {
      overlayEl.addEventListener(evt, (e) => {
        e.preventDefault();
        const coords = getVideoCoords(e);
        send({ type: 'input', event: evt, ...coords, button: e.button });
      });
    }

    overlayEl.addEventListener('contextmenu', (e) => e.preventDefault());

    overlayEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const coords = getVideoCoords(e);
      send({ type: 'input', event: 'wheel', ...coords, deltaX: e.deltaX, deltaY: e.deltaY });
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
      send({ type: 'input', event: 'keydown', key: e.key, code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    });

    document.addEventListener('keyup', (e) => {
      send({ type: 'input', event: 'keyup', key: e.key, code: e.code });
    });
  }
})();
