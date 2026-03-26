# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

Player2PiP is a collaborative video watching app (Russian UI). Users paste a URL to a video page, the server opens it in a headless Puppeteer browser, streams JPEG frames to all connected clients, and relays mouse/keyboard input back to Puppeteer. Think "TeamViewer for watching movies together."

## Commands

- `npm start` / `npm run dev` — start the server (default port 30000, override with `PORT` env var)
- `docker build -t player2pip .` → `docker run -p 30000:30000 player2pip` — build and run in Docker
- No build step, no tests, no linter configured

## Architecture

Single-file Node.js server (`server.js`) + two static HTML pages in `public/`.

### Dual-channel transport (WebRTC DataChannels)

Two separate channels per connected client, established via WebRTC:
- **`frames` DataChannel** (unreliable, unordered) — UDP-like delivery of JPEG frames. Dropped on congestion instead of buffering.
- **`control` DataChannel** (reliable, ordered) — TCP-like delivery for input events, chat, and system notifications.

Socket.IO is used only for initial room join and WebRTC signaling (`webrtc-offer`, `webrtc-answer`, `webrtc-ice`). All runtime data flows through WebRTC DataChannels.

Server-side WebRTC is provided by `node-datachannel` (libdatachannel bindings).

### Server (`server.js`)

- **Express** serves the static files and a small REST API
- **Puppeteer** launches a headless Chrome per room, navigates to the user-provided URL
- **CDP screencast** (`Page.startScreencast`) streams JPEG frames; sent to each client via their `frames` DataChannel
- **Socket.IO** handles only room join and WebRTC signaling
- **`node-datachannel`** creates server-side `PeerConnection` per user with two DataChannels
- Rooms are stored in an in-memory `Map`; each room holds references to its `browser`, `page`, `cdpSession`, and connected `users` (with their `pc`, `framesDC`, `controlDC`)
- Rooms auto-destroy after 5 minutes (`ROOM_TIMEOUT`) if no users are connected
- New browser tabs opened by the page are intercepted and redirected to the main page
- All input events for a room are serialized through a promise-based `inputQueue` to avoid race conditions in Puppeteer input APIs
- Key constants: `VIEWPORT` 1280×720, `FRAME_INTERVAL` 66ms (~15 fps cap), `JPEG_QUALITY` 85

### Client

- `public/index.html` — landing page with room creation form. POSTs to `/api/rooms` and displays the shareable room link.
- `public/room.html` — room viewer. Shows a name-entry modal, then connects via Socket.IO for signaling. Establishes WebRTC PeerConnection with two DataChannels. Receives JPEG frames on `frames` DC, displayed on an `<img>` element via Blob URLs. Sends input via `control` DC as JSON messages. Includes a floating chat panel. User name is persisted in `localStorage` (`p2p_name`).

### Protocol

**Socket.IO (signaling only):**

| Client → Server | Server → Client |
|---|---|
| `join-room` | `room-joined` (initial confirmation) |
| `webrtc-offer` | `webrtc-answer` |
| `webrtc-ice` | `webrtc-ice` |

**Control DataChannel (reliable, JSON):**

| Client → Server | Server → Client |
|---|---|
| `mouse-click`, `mouse-move`, `scroll`, `key-press` | `room-joined`, `user-joined`, `user-left`, `users-count` |
| `chat-message` | `chat-message`, `error-msg` |

**Frames DataChannel (unreliable, binary):**

| Server → Client |
|---|
| Raw JPEG binary (Buffer) |

### Key data flow

1. Client creates room → `POST /api/rooms` → server launches Puppeteer, starts CDP screencast
2. Client joins room → Socket.IO `join-room` → server confirms, client starts WebRTC handshake
3. WebRTC established → server sends cached last frame on `frames` DC + continuous screencast frames
4. Client interacts → JSON on `control` DC → serialized through `inputQueue` → Puppeteer input APIs → updated frame sent back on `frames` DC
5. Frames use unreliable DataChannel (true UDP — dropped on congestion); input/chat use reliable DataChannel

### Deployment

- Deployed as Docker container on VPS, port 30000
- Dockerfile includes Chromium (for Puppeteer) and build tools (for node-datachannel native addon)
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` set in Docker
