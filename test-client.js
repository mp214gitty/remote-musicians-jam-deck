const WebSocket = require('ws');

// Function to simulate a client connecting and performing initial sync
function runTestClient(clientIdLabel) {
  const ws = new WebSocket('ws://localhost:8080');
  let myId = null;

  ws.on('open', () => {
    console.log(`[${clientIdLabel}] Connected to server.`);
    
    // 1. Test Distributed Clock
    const pingTime = Date.now();
    ws.send(JSON.stringify({ type: 'ping', time: pingTime }));
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      console.log(`[${clientIdLabel}] Received binary data from another client. Size: ${data.length} bytes.`);
    } else {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'initial_state':
          myId = msg.clientId;
          console.log(`[${clientIdLabel}] Initial state received. My ID: ${myId}, Tempo: ${msg.state.tempo}, Int: ${msg.state.intervalSize}`);
          
          // 2. Test State Update (only client A will do this)
          if (clientIdLabel === 'Client A') {
            setTimeout(() => {
              console.log(`[${clientIdLabel}] Sending state update...`);
              ws.send(JSON.stringify({ type: 'state_update', tempo: 130, intervalSize: 8 }));
            }, 1000);
          }
          break;
          
        case 'pong':
          const now = Date.now();
          const latency = (now - msg.clientTime) / 2;
          const serverTime = msg.serverTime;
          const offset = serverTime - (msg.clientTime + latency);
          console.log(`[${clientIdLabel}] PONG received. Latency: ${latency}ms, Server Offset: ${offset}ms`);
          
          // 3. Test Binary Audio Routing
          setTimeout(() => {
            console.log(`[${clientIdLabel}] Sending dummy binary chunk...`);
            // Create a small dummy buffer
            const dummyAudioChunk = Buffer.from([0x01, 0x02, 0x03, 0x04]);
            ws.send(dummyAudioChunk, { binary: true });
          }, 2000);
          break;
          
        case 'state_changed':
          console.log(`[${clientIdLabel}] State change broadcast received! Server State -> Tempo: ${msg.state.tempo}, Int: ${msg.state.intervalSize}`);
          break;
      }
    }
  });

  ws.on('close', () => {
    console.log(`[${clientIdLabel}] Disconnected.`);
  });
}

// Start two clients simultaneously to verify they can communicate through the hub
setTimeout(() => runTestClient('Client A'), 500);
setTimeout(() => runTestClient('Client B'), 1500);

// Close process after test finishes
setTimeout(() => {
  console.log('Test complete. Exiting.');
  process.exit(0);
}, 5000);
