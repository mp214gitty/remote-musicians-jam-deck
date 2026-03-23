<script lang="ts">
  import Mixer from './lib/Mixer.svelte';
  import Metronome from './lib/Metronome.svelte';
  import Grid from './lib/Grid.svelte';
  import { network } from './lib/NetworkManager';
  import { session } from './lib/sessionStore';
  import { onMount } from 'svelte';

  let myName = $state('');
  let connected = $state(false);
  let inputName = $state('');
  let remotePeerCount = $state(0);

  function handleConnect() {
    if (!inputName.trim()) return;
    myName = 'Connecting...';
    network.connect(inputName.trim());
  }

  onMount(() => {
    const unsub = session.subscribe(() => {
      myName = session.myName || '';
      connected = session.connected;
      remotePeerCount = session.remotePeers.length;
    });

    return () => {
      unsub();
      network.disconnect();
    };
  });
</script>

<main class="app-container">
  {#if !connected}
    <div class="login-modal-container">
      <div class="login-modal glass-panel">
        <h1>Welcome to Jam Deck</h1>
        <p>Enter your stage name to join the session.</p>
        <input type="text" bind:value={inputName} placeholder="Musician Name" onkeydown={(e) => e.key === 'Enter' && handleConnect()} />
        <button class="connect-btn" disabled={!inputName.trim()} onclick={handleConnect}>Connect to Musician</button>
      </div>
    </div>
  {:else}
    <div class="content">
      <div class="sidebar glass-panel">
        <div class="header">
          <h1>Jam Session</h1>
          <div class="status-group">
            {#if remotePeerCount > 0}
              <span class="peer-count">{remotePeerCount} online</span>
            {/if}
            <span class="identity">{myName}</span>
          </div>
        </div>
        <Metronome />
        <hr />
        <Mixer />
      </div>

      <div class="main-stage">
        <Grid />
      </div>
    </div>
  {/if}
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

  .status-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .peer-count {
    font-size: 11px;
    font-weight: 700;
    color: var(--green);
    background: rgba(50, 215, 75, 0.1);
    padding: 2px 8px;
    border-radius: 12px;
    text-transform: uppercase;
  }

  .login-modal-container {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }

  .login-modal {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 40px;
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 400px;
    text-align: center;
  }

  .login-modal h1 {
    font-size: 28px;
    font-weight: 700;
  }

  .login-modal p {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 8px;
  }

  .login-modal input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid var(--panel-border);
    background: rgba(255, 255, 255, 0.05);
    color: white;
    font-size: 16px;
    outline: none;
    transition: border-color 0.2s;
  }

  .login-modal input:focus {
    border-color: var(--accent);
  }

  .connect-btn {
    width: 100%;
    padding: 14px;
    border-radius: 8px;
    background: var(--accent);
    color: white;
    font-size: 16px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
  }

  .connect-btn:hover:not(:disabled) {
    background: #0081ff;
  }

  .connect-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
