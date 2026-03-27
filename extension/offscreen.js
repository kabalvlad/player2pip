const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let pc = null;
let dataChannel = null;
let stream = null;

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.action) {
    case 'start-capture':
      startCapture(msg.streamId);
      break;

    case 'viewer-joined':
      createOffer();
      break;

    case 'viewer-disconnected':
      closePeerConnection();
      break;

    case 'signal-in':
      handleSignal(msg.data);
      break;

    case 'stop-capture':
      cleanup();
      break;
  }
});

async function startCapture(streamId) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });
}

async function createOffer() {
  if (!stream) return;

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Add tracks from captured stream
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  // Create data channel for input events
  dataChannel = pc.createDataChannel('input', { ordered: true });
  dataChannel.onmessage = (e) => {
    const inputMsg = JSON.parse(e.data);
    // Relay input to background -> content script
    chrome.runtime.sendMessage({ action: 'relay-input', data: inputMsg });
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      chrome.runtime.sendMessage({
        action: 'signal-out',
        data: { type: 'ice-candidate', candidate: e.candidate }
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      closePeerConnection();
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  chrome.runtime.sendMessage({
    action: 'signal-out',
    data: { type: 'offer', sdp: offer.sdp }
  });
}

async function handleSignal(msg) {
  if (!pc) return;

  if (msg.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
  } else if (msg.type === 'ice-candidate' && msg.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }
}

function closePeerConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
}

function cleanup() {
  closePeerConnection();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}
