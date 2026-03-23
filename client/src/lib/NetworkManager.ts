import { session } from './sessionStore';
import { engine } from './AudioEngine';

const WS_URL = 'ws://136.113.32.114:8080';

class NetworkManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose: boolean = false;
  private lastProvidedName?: string;
  private serverTimeOffset: number = 0; // serverTime - localTime

  connect(name?: string) {
    if (name !== undefined) this.lastProvidedName = name;

    // Guard against already open or currently connecting sockets
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        return;
      }
      // Dead socket — clean up
      this.ws = null;
    }

    this.intentionalClose = false;
    let urlToConnect = WS_URL;
    if (this.lastProvidedName) {
      urlToConnect += `?name=${encodeURIComponent(this.lastProvidedName)}`;
    }
    console.log('[Net] Connecting to', urlToConnect);
    this.ws = new WebSocket(urlToConnect);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Net] Connected');
      session.setConnected(true);
      this.sendPing();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const full = new Uint8Array(event.data);
        const textDecoder = new TextDecoder();
        
        // Format from server: "senderId|measureId|audioData"
        const pipe1 = full.indexOf(0x7C); // 1st '|'
        if (pipe1 === -1) return;
        const senderId = textDecoder.decode(full.slice(0, pipe1));
        
        const remaining = full.slice(pipe1 + 1);
        const pipe2 = remaining.indexOf(0x7C); // 2nd '|'
        if (pipe2 === -1) return;
        const measureIdStr = textDecoder.decode(remaining.slice(0, pipe2));
        const measureId = parseInt(measureIdStr);
        
        console.log(`[Net] Received audio measure ${measureId} from ${senderId} (${event.data.byteLength} bytes)`);
        
        // The actual audio data starts after the 2nd pipe
        const audioBuf = event.data.slice(pipe1 + 1 + pipe2 + 1);
        engine.queueRemoteAudio(senderId, audioBuf, measureId);
        return;
      }

      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'initial_state':
            session.setIdentity(msg.clientId, msg.displayName);
            session.setPeers(msg.peers);
            session.setTempo(msg.state.tempo);
            session.setPlaying(msg.state.playing);
            engine.setBpm(msg.state.tempo);
            if (msg.state.playing) { engine.startMetronome(); }
            console.log(`[Net] I am "${msg.displayName}" (${msg.clientId})`);
            break;

          case 'peer_list':
            session.setPeers(msg.peers);
            break;

          case 'state_changed':
            session.setTempo(msg.state.tempo);
            engine.setBpm(msg.state.tempo);
            if (typeof msg.state.playing === 'boolean') {
              session.setPlaying(msg.state.playing);
              if (msg.state.playing) {
                // Synchronized start
                const localStartTime = (msg.state.serverStartTime || Date.now()) - this.serverTimeOffset;
                const delayMs = localStartTime - Date.now();
                console.log(`[Net] Scheduled start in ${delayMs}ms (shared clock)`);
                setTimeout(() => engine.startMetronome(), Math.max(0, delayMs));
              } else {
                engine.stopMetronome();
              }
            }
            break;

          case 'pong':
            const now = Date.now();
            const rtt = now - msg.clientTime;
            const latency = rtt / 2;
            this.serverTimeOffset = (msg.serverTime - latency) - msg.clientTime;
            console.log(`[Net] Latency: ${latency.toFixed(1)}ms | Clock Offset: ${this.serverTimeOffset}ms`);
            break;
        }
      } catch (err) {
        console.error('[Net] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected');
      session.setConnected(false);
      this.ws = null;
      if (!this.intentionalClose) {
        console.log('[Net] Reconnecting in 2s...');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[Net] WebSocket error:', err);
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    session.setConnected(false);
  }

  sendStateUpdate(opts: { tempo?: number; playing?: boolean }) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'state_update', ...opts }));
    }
  }

  sendAudioChunk(blob: Blob, measureId: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      blob.arrayBuffer().then((buf) => {
        const header = new TextEncoder().encode(measureId + '|');
        const combined = new Uint8Array(header.length + buf.byteLength);
        combined.set(header);
        combined.set(new Uint8Array(buf), header.length);
        this.ws!.send(combined);
      });
    }
  }

  private sendPing() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
    }
  }
}

export const network = new NetworkManager();
