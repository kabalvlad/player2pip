const SERVER_URL = 'ws://localhost:3000'; // Change to wss://your-domain.com for production

let ws = null;
let activeTabId = null;
let roomId = null;
let sharing = false;

// Listen for messages from popup and offscreen
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start-sharing') {
    startSharing().then(sendResponse);
    return true; // async response
  }

  if (msg.action === 'stop-sharing') {
    stopSharing();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'get-status') {
    sendResponse({ sharing, roomId });
    return false;
  }

  // Relay signaling messages from offscreen to WebSocket
  if (msg.action === 'signal-out') {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg.data));
    }
    return false;
  }

  // Relay input events from offscreen to content script
  if (msg.action === 'relay-input' && activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      action: 'simulate-input',
      data: msg.data
    });
    return false;
  }
});

async function startSharing() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { error: 'No active tab' };
  activeTabId = tab.id;

  // Get tab capture stream ID
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId });

  // Connect to signaling server
  try {
    await connectSignaling();
  } catch (e) {
    return { error: 'Cannot connect to server: ' + e.message };
  }

  // Create room
  roomId = await createRoom();

  // Ensure offscreen document exists
  await ensureOffscreen();

  // Send stream info to offscreen document
  chrome.runtime.sendMessage({
    action: 'start-capture',
    streamId,
    roomId
  });

  sharing = true;
  return { roomId };
}

function stopSharing() {
  sharing = false;
  roomId = null;
  activeTabId = null;
  chrome.runtime.sendMessage({ action: 'stop-capture' });
  if (ws) {
    ws.close();
    ws = null;
  }
}

function connectSignaling() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(SERVER_URL);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error('WebSocket error'));
    ws.onclose = () => {
      sharing = false;
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'viewer-joined') {
        // Notify offscreen to create offer
        chrome.runtime.sendMessage({ action: 'viewer-joined' });
      } else if (msg.type === 'viewer-disconnected') {
        chrome.runtime.sendMessage({ action: 'viewer-disconnected' });
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, { action: 'remove-cursor' });
        }
      } else if (msg.type === 'answer' || msg.type === 'ice-candidate') {
        // Forward signaling to offscreen
        chrome.runtime.sendMessage({ action: 'signal-in', data: msg });
      }
    };
  });
}

function createRoom() {
  return new Promise((resolve) => {
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room-created') {
        ws.removeEventListener('message', handler);
        resolve(msg.roomId);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ type: 'create-room' }));
  });
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Tab capture and WebRTC peer connection'
    });
  }
}

// Re-inject content script on tab navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'complete' && sharing) {
    chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ['content.js']
    });
  }
});
