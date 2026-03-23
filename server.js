const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const url = require('url');

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
  // Return array of { id, name } for every connected client
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

wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const customName = parsedUrl.query.name;

  const clientId = uuidv4();
  const displayName = customName || NAME_POOL[nameIndex % NAME_POOL.length];
  if (!customName) nameIndex++;

  clients.set(clientId, { ws, name: displayName });

  console.log(`Client connected: ${clientId} as "${displayName}" (Total: ${clients.size})`);

  // Send initial state to the new client (includes their own identity)
  ws.send(JSON.stringify({
    type: 'initial_state',
    clientId: clientId,
    displayName: displayName,
    state: globalState,
    peers: getPeerList()
  }));

  // Notify all clients of the updated peer list
  broadcastPeerList();

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      // Audio Routing Pipeline: broadcast binary to all OTHER clients
      // Prepend the sender's ID so receivers know who sent it
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
            
            console.log(`State updated by ${clientId}: Tempo: ${globalState.tempo}, Playing: ${globalState.playing}`);
            broadcastState();
            break;
            
          default:
            console.log(`Unknown message type from ${clientId}:`, data.type);
        }
      } catch (err) {
        console.error(`Failed to parse message from ${clientId}:`, err);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId} (Total: ${clients.size})`);
    broadcastPeerList();
  });

  ws.on('error', (error) => {
    console.error(`Socket error for client ${clientId}:`, error);
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

console.log(`🚀 Jam Server running on ws://localhost:${PORT}`);
