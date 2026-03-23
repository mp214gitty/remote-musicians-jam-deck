<script lang="ts">
  import { engine } from './AudioEngine';
  import { network } from './NetworkManager';
  import { session } from './sessionStore';
  import { onMount } from 'svelte';

  let bpm = $state(120);
  let isPlaying = $state(false);

  onMount(() => {
    const unsub = session.subscribe(() => {
      if (session.tempo !== bpm) {
        bpm = session.tempo;
      }
      if (session.playing !== isPlaying) {
        isPlaying = session.playing;
      }
    });
    return unsub;
  });

  async function toggle() {
    const newState = !isPlaying;
    isPlaying = newState;
    if (newState) {
      await engine.startMetronome();
    } else {
      engine.stopMetronome();
    }
    // Broadcast play/stop to all clients
    network.sendStateUpdate({ playing: newState });
  }

  function handleBpmChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value);
    if (!isNaN(val) && val >= 40 && val <= 240) {
      bpm = val;
      engine.setBpm(val);
      network.sendStateUpdate({ tempo: val });
    }
  }
</script>

<div class="metronome">
  <h2>Metronome</h2>
  
  <div class="controls">
    <div class="bpm-control">
      <input type="number" bind:value={bpm} oninput={handleBpmChange} min="40" max="240" />
      <span class="label">BPM</span>
    </div>

    <button class={isPlaying ? 'active' : ''} onclick={toggle}>
      {isPlaying ? 'Stop' : 'Play'}
    </button>
  </div>
</div>

<style>
  .metronome {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .bpm-control {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  input[type="number"] {
    width: 60px;
    font-size: 24px;
    font-weight: 600;
    background: transparent;
    border: none;
    color: var(--text-main);
    outline: none;
  }
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .label {
    font-size: 14px;
    color: var(--text-muted);
    font-weight: 500;
  }
  button {
    min-width: 80px;
    background: rgba(134, 134, 139, 0.15);
    color: var(--text-main);
  }
  button.active {
    background: var(--accent);
    color: white;
  }
</style>
