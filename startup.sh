#!/bin/bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create application directory
mkdir -p /app
cd /app

# Write server.js
cat <<'EOF' > server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Display name pool – assigned round-robin
const NAME_POOL = ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank'];
let nameIndex = 0;

// Global State
let globalState = {
  tempo: 120, // BPM
  intervalSize: 4, // Beats Per Interval
  playing: false
};

// Store connected clients: id -> { ws, name }
const clients = new Map();

function getPeerList() {
  return Array.from(clients.entries()).map(([id, info]) => ({
    id,
    name: info.name
  }));
}

function broadcastPeerList() {
  const peerList = getPeerList();
  const msg = JSON.stringify({ type: 'peer_list', peers: peerList });
  for (const [, info] of clients.entries()) {
    if (info.ws.readyState === WebSocket.OPEN) {
      info.ws.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  const displayName = NAME_POOL[nameIndex % NAME_POOL.length];
  nameIndex++;

  clients.set(clientId, { ws, name: displayName });

  console.log(`Client connected: ${clientId} as "${displayName}" (Total: ${clients.size})`);

  ws.send(JSON.stringify({
    type: 'initial_state',
    clientId: clientId,
    displayName: displayName,
    state: globalState,
    peers: getPeerList()
  }));

  broadcastPeerList();

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      const senderIdBuffer = Buffer.from(clientId + '|');
      const combined = Buffer.concat([senderIdBuffer, message]);
      for (const [id, info] of clients.entries()) {
        if (id !== clientId && info.ws.readyState === WebSocket.OPEN) {
          info.ws.send(combined, { binary: true });
        }
      }
    } else {
      try {
        const data = JSON.parse(message.toString());
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({
              type: 'pong',
              clientTime: data.time,
              serverTime: Date.now()
            }));
            break;
          case 'state_update':
            if (data.tempo) globalState.tempo = data.tempo;
            if (data.intervalSize) globalState.intervalSize = data.intervalSize;
            if (typeof data.playing === 'boolean') globalState.playing = data.playing;
            broadcastState();
            break;
        }
      } catch (err) {}
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    broadcastPeerList();
  });
});

function broadcastState() {
  const stateMessage = JSON.stringify({
    type: 'state_changed',
    state: globalState
  });
  for (const [, info] of clients.entries()) {
    if (info.ws.readyState === WebSocket.OPEN) {
      info.ws.send(stateMessage);
    }
  }
}

console.log(`🚀 Jam Server running on port ${PORT}`);
EOF

# Write package.json
cat <<EOF > package.json
{
  "name": "jam-server",
  "version": "1.0.0",
  "main": "server.js",
  "dependencies": {
    "ws": "^8.20.0",
    "uuid": "^13.0.0"
  }
}
EOF

# Install dependencies
npm install

# Start the server using nohup
nohup node server.js > server.log 2>&1 &
