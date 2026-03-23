// Svelte 5 reactive session store
// Shared state across all components for identity and peer list

export type Peer = {
  id: string;
  name: string;
};

class SessionStore {
  // Reactive state using Svelte 5 runes won't work outside .svelte files,
  // so we use a simple pub/sub pattern with callbacks.
  private _myId: string = '';
  private _myName: string = '';
  private _peers: Peer[] = [];
  private _tempo: number = 120;
  private _playing: boolean = false;
  private _connected: boolean = false;
  private _listeners: Set<() => void> = new Set();

  get myId() { return this._myId; }
  get myName() { return this._myName; }
  get peers() { return this._peers; }
  get remotePeers(): Peer[] {
    return this._peers.filter(p => p.id !== this._myId);
  }
  get tempo() { return this._tempo; }
  get playing() { return this._playing; }
  get connected() { return this._connected; }

  setIdentity(id: string, name: string) {
    this._myId = id;
    this._myName = name;
    this.notify();
  }

  setPeers(peers: Peer[]) {
    this._peers = peers;
    this.notify();
  }

  setTempo(bpm: number) {
    this._tempo = bpm;
    this.notify();
  }

  setPlaying(val: boolean) {
    this._playing = val;
    this.notify();
  }

  setConnected(val: boolean) {
    this._connected = val;
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private notify() {
    for (const fn of this._listeners) fn();
  }
}

export const session = new SessionStore();
