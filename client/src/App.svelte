<script lang="ts">
  import Mixer from './lib/Mixer.svelte';
  import Metronome from './lib/Metronome.svelte';
  import Grid from './lib/Grid.svelte';
  import { network } from './lib/NetworkManager';
  import { session } from './lib/sessionStore';
  import { onMount } from 'svelte';

  let myName = $state('Connecting...');
  let connected = $state(false);

  onMount(() => {
    network.connect();

    const unsub = session.subscribe(() => {
      myName = session.myName || 'Connecting...';
      connected = session.connected;
    });

    return () => {
      unsub();
      network.disconnect();
    };
  });
</script>

<main class="app-container">
  <div class="content">
    <div class="sidebar glass-panel">
      <div class="header">
        <h1>Jam Session</h1>
        <span class="identity">{myName}</span>
      </div>
      <Metronome />
      <hr />
      <Mixer />
    </div>

    <div class="main-stage">
      <Grid />
    </div>
  </div>
</main>

<style>
  .app-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .content {
    flex: 1;
    display: flex;
    padding: 20px;
    gap: 20px;
    overflow: hidden;
  }

  .sidebar {
    width: 300px;
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 24px;
    overflow-y: auto;
  }

  .sidebar::-webkit-scrollbar {
    display: none;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .header h1 {
    font-size: 24px;
    font-weight: 600;
  }

  .identity {
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
    background: rgba(0, 113, 227, 0.1);
    padding: 2px 10px;
    border-radius: 12px;
  }

  hr {
    border: 0;
    border-top: 1px solid var(--panel-border);
    margin: 0;
  }

  .main-stage {
    flex: 1;
    display: flex;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
</style>
