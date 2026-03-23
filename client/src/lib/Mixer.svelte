<script lang="ts">
  import { engine, type InputChannel } from './AudioEngine';
  import { session } from './sessionStore';
  import { onMount } from 'svelte';

  type ChannelState = {
    id: string;
    name: string;
    volume: number;   // 0–100
    pan: number;       // -1 to +1
    muted: boolean;
    soloed: boolean;
    deviceId?: string; // For local inputs
  };

  // --- Local Room State ---
  let metronomeVolume = $state(80);
  
  // Two dedicated local inputs as per user request
  let input1: ChannelState = $state({
    id: 'input-0',
    name: 'Input 1',
    volume: 75,
    pan: 0,
    muted: false,
    soloed: false,
    deviceId: ''
  });

  let input2: ChannelState = $state({
    id: 'input-1',
    name: 'Input 2',
    volume: 75,
    pan: 0,
    muted: false,
    soloed: false,
    deviceId: ''
  });

  let availableDevices: MediaDeviceInfo[] = $state([]);
  let remoteChannels: ChannelState[] = $state([]);

  // --- Solo/Mute Logic ---
  let localInputs = $derived([input1, input2]);
  let allChannels = $derived([...localInputs, ...remoteChannels]);
  let anySoloed = $derived(allChannels.some(ch => ch.soloed));

  onMount(() => {
    let unsub: () => void;

    async function init() {
      // Initial device load
      try {
        availableDevices = await engine.getAudioInputDevices();
        // Auto-assign first device to input 1 if not set
        if (availableDevices.length > 0) {
          input1.deviceId = availableDevices[0].deviceId;
          handleDeviceChange('input-0', input1.deviceId!);
        }
      } catch (err) {
        console.error('Failed to load audio devices:', err);
      }

      // Subscribe to session for remote peers
      unsub = session.subscribe(() => {
        const current = session.remotePeers;
        remoteChannels = current.map(peer => {
          const existing = remoteChannels.find(ch => ch.id === peer.id);
          if (existing) return { ...existing, name: peer.name };
          return { id: peer.id, name: peer.name, volume: 75, pan: 0, muted: false, soloed: false };
        });
        
        const activeIds = new Set(current.map(p => p.id));
        for (const ch of remoteChannels) {
          if (!activeIds.has(ch.id)) engine.removeChannelStrip(ch.id);
        }
      });
    }

    init();
    return () => unsub?.();
  });

  // Handle hardware device changes
  async function handleDeviceChange(channelId: string, deviceId: string) {
    const label = availableDevices.find(d => d.deviceId === deviceId)?.label || (deviceId ? 'Audio Input' : 'No Input');
    await engine.updateInputDevice(channelId, deviceId, label);
  }

  // Reactive updates to engine
  $effect(() => {
    engine.setMetronomeVolume(metronomeVolume);
  });

  $effect(() => {
    for (const ch of allChannels) {
      // If it's a local input and deviceId is empty, force volume to 0 in the engine
      const effectiveVol = (ch.id.startsWith('input-') && !ch.deviceId) ? 0 : ch.volume;
      engine.setChannelVolume(ch.id, effectiveVol);
      engine.setChannelPan(ch.id, ch.pan);
    }
  });

  $effect(() => {
    for (const ch of allChannels) {
      const gate = anySoloed ? (ch.soloed ? 1 : 0) : (ch.muted ? 0 : 1);
      engine.setChannelMuteGate(ch.id, gate);
    }
  });

  function formatPan(val: number): string {
    if (Math.abs(val) < 0.05) return 'C';
    return val < 0 ? `L${Math.round(Math.abs(val) * 100)}` : `R${Math.round(val * 100)}`;
  }
</script>

<div class="mixer">
  <!-- ==================== YOUR ROOM (LOCAL) ==================== -->
  <section class="room-section local-room">
    <div class="section-header">
      <span class="status-dot online"></span>
      <h2>Your Room</h2>
    </div>

    <!-- Metronome Track -->
    <div class="track metronome-track">
      <div class="track-header">
        <span class="track-name">Metronome</span>
        <span class="track-val">{metronomeVolume}%</span>
      </div>
      <input type="range" min="0" max="100" bind:value={metronomeVolume} class="vol-slider" />
    </div>

    <!-- Local Input 1 -->
    <div class="track input-track" class:disabled={!input1.deviceId}>
      <div class="track-header">
        <select bind:value={input1.deviceId} onchange={() => handleDeviceChange('input-0', input1.deviceId || '')} class="device-select">
          <option value="">(No Input)</option>
          {#each availableDevices as device}
            <option value={device.deviceId}>{device.label || 'Unknown Device'}</option>
          {/each}
        </select>
        <span class="track-val">{input1.volume}%</span>
      </div>
      
      <div class="controls">
        <div class="vol-row">
          <input type="range" min="0" max="100" bind:value={input1.volume} class="vol-slider" />
        </div>
        <div class="pan-row">
          <span class="label">PAN</span>
          <div class="pan-slider-container">
            <input type="range" min="-1" max="1" step="0.01" bind:value={input1.pan} class="pan-slider" />
            <div class="pan-ticks">
              <span>L</span>
              <span class="center-tick" class:highlighted={Math.abs(Number(input1.pan)) < 0.1}>C</span>
              <span>R</span>
            </div>
          </div>
          <span class="pan-readout-small">{formatPan(input1.pan)}</span>
        </div>
        <div class="buttons">
          <button class="mute-btn" class:active={input1.muted} onclick={() => input1.muted = !input1.muted}>M</button>
          <button class="solo-btn" class:active={input1.soloed} onclick={() => input1.soloed = !input1.soloed}>S</button>
        </div>
      </div>
    </div>

    <!-- Local Input 2 -->
    <div class="track input-track" class:disabled={!input2.deviceId}>
      <div class="track-header">
        <select bind:value={input2.deviceId} onchange={() => handleDeviceChange('input-1', input2.deviceId || '')} class="device-select">
          <option value="">(No Input)</option>
          {#each availableDevices as device}
            <option value={device.deviceId}>{device.label || 'Unknown Device'}</option>
          {/each}
        </select>
        <span class="track-val">{input2.volume}%</span>
      </div>
      
      <div class="controls">
        <div class="vol-row">
          <input type="range" min="0" max="100" bind:value={input2.volume} class="vol-slider" />
        </div>
        <div class="pan-row">
          <span class="label">PAN</span>
          <div class="pan-slider-container">
            <input type="range" min="-1" max="1" step="0.01" bind:value={input2.pan} class="pan-slider" />
            <div class="pan-ticks">
              <span>L</span>
              <span class="center-tick" class:highlighted={Math.abs(Number(input2.pan)) < 0.1}>C</span>
              <span>R</span>
            </div>
          </div>
          <span class="pan-readout-small">{formatPan(input2.pan)}</span>
        </div>
        <div class="buttons">
          <button class="mute-btn" class:active={input2.muted} onclick={() => input2.muted = !input2.muted}>M</button>
          <button class="solo-btn" class:active={input2.soloed} onclick={() => input2.soloed = !input2.soloed}>S</button>
        </div>
      </div>
    </div>
  </section>

  <!-- ==================== REMOTE MUSICIANS ==================== -->
  <section class="room-section remote-room">
    <div class="section-header">
      <h2>Remote Musicians</h2>
    </div>

    <div class="peer-grid">
      {#each remoteChannels as ch (ch.id)}
        <div class="track peer-track">
          <div class="track-header">
            <span class="track-name">{ch.name}</span>
            <span class="track-val">{ch.volume}%</span>
          </div>
          
          <div class="controls">
            <div class="vol-row">
              <input type="range" min="0" max="100" bind:value={ch.volume} class="vol-slider" />
            </div>
              <div class="pan-row">
                <span class="label">PAN</span>
                <div class="pan-slider-container">
                  <input type="range" min="-1" max="1" step="0.01" bind:value={ch.pan} class="pan-slider" />
                  <div class="pan-ticks">
                    <span>L</span>
                    <span class="center-tick" class:highlighted={Math.abs(Number(ch.pan)) < 0.1}>C</span>
                    <span>R</span>
                  </div>
                </div>
                <span class="pan-readout-small">{formatPan(ch.pan)}</span>
              </div>
            <div class="buttons">
              <button class="mute-btn" class:active={ch.muted} onclick={() => ch.muted = !ch.muted}>M</button>
              <button class="solo-btn" class:active={ch.soloed} onclick={() => ch.soloed = !ch.soloed}>S</button>
            </div>
          </div>
        </div>
      {:else}
        <div class="empty-state">Waiting for others to join...</div>
      {/each}
    </div>
  </section>
</div>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-bottom: 24px;
  }

  .room-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: var(--radius-lg);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
    padding: 0 4px;
  }

  h2 {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.online {
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }

  /* --- Tracks --- */
  .track {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    transition: all 0.2s ease;
  }

  .track.disabled {
    opacity: 0.4;
    pointer-events: none;
    filter: grayscale(0.5);
  }

  .track.disabled .track-header {
    pointer-events: all; /* Allow enabling the device select */
  }

  .track:hover {
    box-shadow: var(--shadow-subtle);
  }

  .track-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .track-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-main);
  }

  .track-val {
    font-size: 12px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .device-select {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: 8px;
    outline: none;
    cursor: pointer;
    flex: 1;
    margin-right: 12px;
    max-width: 220px;
    position: relative;
    z-index: 10;
  }

  .device-select option {
    background: #1c1c1e;
    color: var(--text-main);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pan-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted);
    width: 32px;
  }

  .pan-slider-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pan-ticks {
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
    font-size: 9px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.4);
    margin-top: -2px;
  }

  .center-tick {
    color: rgba(255, 255, 255, 0.3);
    transition: color 0.2s;
  }

  .center-tick.highlighted {
    color: #fff;
    text-shadow: 0 0 10px var(--accent), 0 0 20px var(--accent);
    font-weight: 800;
  }

  .pan-readout-small {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted);
    width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .buttons {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .mute-btn, .solo-btn {
    flex: 1;
    height: 32px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mute-btn.active {
    background: var(--red);
    color: white;
    border-color: var(--red);
    box-shadow: 0 0 12px rgba(255, 69, 58, 0.3);
  }

  .solo-btn.active {
    background: var(--green);
    color: white;
    border-color: var(--green);
    box-shadow: 0 0 12px rgba(50, 215, 75, 0.3);
  }

  /* --- Remote Peer Styling --- */
  .remote-room {
    background: rgba(94, 92, 230, 0.02);
    border-color: rgba(94, 92, 230, 0.08);
  }

  .peer-track {
    border: 1px solid rgba(94, 92, 230, 0.12); /* Subtle accent border */
    background: rgba(94, 92, 230, 0.01);
  }

  .peer-track:hover {
    border-color: rgba(94, 92, 230, 0.25);
  }

  .peer-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
    padding: 24px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--panel-border);
    border-radius: var(--radius-md);
  }

  /* Custom range input styling is in app.css, but let's ensure it's tight here */
  input[type="range"] {
    cursor: pointer;
  }
</style>
