<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from './AudioEngine';
  import { session } from './sessionStore';
  import * as Tone from 'tone';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  
  let animationFrameId: number;
  let isConnected = $state(false);

  // Colors assigned to peers by index
  const PEER_COLORS = ['#ff3b30', '#34c759', '#ff9500', '#af52de', '#5ac8fa', '#ff2d55'];

  let localUser = { x: 0, y: 0, color: '#5e5ce6', size: 24 };

  function getRemotePeerPositions() {
    const peers = session.remotePeers;

    if (peers.length === 1) {
      // Horizontal layout: local sits at -120, remote at +120
      localUser.x = -120;
      localUser.y = 0;
      return [{
        id: peers[0].id,
        name: peers[0].name,
        x: 120,
        y: 0,
        color: PEER_COLORS[0],
        size: 20
      }];
    }

    // 2+ remote peers: circular layout, local back at center
    localUser.x = 0;
    localUser.y = 0;
    const radius = 160;
    return peers.map((peer, i) => {
      const angle = (2 * Math.PI * i) / peers.length - Math.PI / 2;
      return {
        id: peer.id,
        name: peer.name,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        color: PEER_COLORS[i % PEER_COLORS.length],
        size: 20
      };
    });
  }

  type Pulse = {
    id: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startTime: number;
    duration: number;
    color: string;
  };

  let pulses: Pulse[] = [];
  let pulseIdCounter = 0;

  // Trigger incoming pulse: remote → local
  function triggerIncomingPulse(senderId: string, durationInSeconds: number) {
    const peers = getRemotePeerPositions();
    const sender = peers.find(u => u.id === senderId);
    if (!sender) return;

    pulses.push({
      id: pulseIdCounter++,
      startX: sender.x,
      startY: sender.y,
      endX: localUser.x,
      endY: localUser.y,
      startTime: Tone.now(),
      duration: durationInSeconds,
      color: sender.color
    });
  }

  // Trigger outgoing pulse: local → remote
  function triggerOutgoingPulse(durationInSeconds: number) {
    const peers = getRemotePeerPositions();
    for (const peer of peers) {
      pulses.push({
        id: pulseIdCounter++,
        startX: localUser.x,
        startY: localUser.y,
        endX: peer.x,
        endY: peer.y,
        startTime: Tone.now(),
        duration: durationInSeconds,
        color: localUser.color
      });
    }
  }

  function renderGrid() {
    if (!ctx || !canvas) return;

    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Dark gradient background
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(canvas.width, canvas.height) * 0.7);
    bgGrad.addColorStop(0, '#12121a');
    bgGrad.addColorStop(0.5, '#0c0c14');
    bgGrad.addColorStop(1, '#08080e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle glowing grid lines
    ctx.strokeStyle = 'rgba(94, 92, 230, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let i = 0; i < canvas.width; i += gridSize) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw connection lines (faint) between local and remote peers
    const peers = getRemotePeerPositions();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    peers.forEach(peer => {
      ctx!.beginPath();
      ctx!.moveTo(centerX + localUser.x, centerY + localUser.y);
      ctx!.lineTo(centerX + peer.x, centerY + peer.y);
      ctx!.stroke();
    });

    // Render Pulses with trails
    const currentTime = Tone.now();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const elapsed = currentTime - p.startTime;
      let progress = elapsed / p.duration;
      
      if (progress >= 1) {
        pulses.splice(i, 1);
        continue;
      }

      const currentX = p.startX + (p.endX - p.startX) * progress;
      const currentY = p.startY + (p.endY - p.startY) * progress;

      // Glow trail
      const trailGrad = ctx.createRadialGradient(
        centerX + currentX, centerY + currentY, 0,
        centerX + currentX, centerY + currentY, 20
      );
      trailGrad.addColorStop(0, p.color + 'aa');
      trailGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = trailGrad;
      ctx.fillRect(centerX + currentX - 20, centerY + currentY - 20, 40, 40);

      // Solid core
      ctx.beginPath();
      ctx.arc(centerX + currentX, centerY + currentY, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.closePath();
    }

    // Render Remote Users with ring style
    peers.forEach(user => {
      // Outer glow
      const glowGrad = ctx!.createRadialGradient(
        centerX + user.x, centerY + user.y, user.size - 4,
        centerX + user.x, centerY + user.y, user.size + 12
      );
      glowGrad.addColorStop(0, user.color + '30');
      glowGrad.addColorStop(1, 'transparent');
      ctx!.fillStyle = glowGrad;
      ctx!.fillRect(centerX + user.x - 30, centerY + user.y - 30, 60, 60);

      // Ring
      ctx!.beginPath();
      ctx!.arc(centerX + user.x, centerY + user.y, user.size, 0, Math.PI * 2);
      ctx!.strokeStyle = user.color;
      ctx!.lineWidth = 3;
      ctx!.stroke();
      
      // Inner fill
      ctx!.beginPath();
      ctx!.arc(centerX + user.x, centerY + user.y, user.size - 4, 0, Math.PI * 2);
      ctx!.fillStyle = user.color + '20';
      ctx!.fill();
      
      // Label
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx!.font = '500 11px Inter';
      ctx!.textAlign = 'center';
      ctx!.fillText(user.name, centerX + user.x, centerY + user.y + user.size + 18);
    });

    // Render Local User with strong glow
    const localGlow = ctx.createRadialGradient(
      centerX + localUser.x, centerY + localUser.y, localUser.size - 6,
      centerX + localUser.x, centerY + localUser.y, localUser.size + 20
    );
    localGlow.addColorStop(0, '#5e5ce640');
    localGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = localGlow;
    ctx.fillRect(centerX + localUser.x - 40, centerY + localUser.y - 40, 80, 80);

    ctx.beginPath();
    ctx.arc(centerX + localUser.x, centerY + localUser.y, localUser.size, 0, Math.PI * 2);
    ctx.fillStyle = '#5e5ce6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(session.myName || 'You', centerX + localUser.x, centerY + localUser.y + localUser.size + 18);

    animationFrameId = requestAnimationFrame(renderGrid);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    renderGrid();

    // Subscribe to session for connection status
    const unsub = session.subscribe(() => {
      isConnected = session.connected;
    });

    // Simulate demo pulses every measure
    const simInterval = setInterval(() => {
      if (Tone.Transport.state === 'started') {
        const peers = getRemotePeerPositions();
        if (peers.length > 0) {
          const fakeDelay = Tone.Time("1m").toSeconds();

          // Incoming pulse from first remote peer
          triggerIncomingPulse(peers[0].id, fakeDelay);
          const nextMeasureTime = Tone.Transport.nextSubdivision("1m");
          engine.simulateRemoteBeep(peers[0].id, nextMeasureTime);

          // Outgoing pulse from local user to all peers
          triggerOutgoingPulse(fakeDelay);
        }
      }
    }, Math.max(Tone.Time("1m").toMilliseconds(), 2000));

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(simInterval);
      unsub();
    };
  });
</script>

<div class="grid-container glass-panel">
  <canvas bind:this={canvas}></canvas>
  
  <div class="overlay">
    <div class="status-indicator">
      <div class="dot" class:active={isConnected}></div>
      <span>{isConnected ? 'Connected' : 'Offline'}</span>
    </div>
  </div>
</div>

<style>
  .grid-container {
    flex: 1;
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: transparent;
    border: 1px solid var(--panel-border);
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .overlay {
    position: absolute;
    top: 16px;
    right: 16px;
    pointer-events: none;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(18, 18, 24, 0.8);
    padding: 6px 12px;
    border-radius: 20px;
    backdrop-filter: var(--blur);
    -webkit-backdrop-filter: var(--blur);
    border: 1px solid var(--panel-border);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--red);
  }

  .dot.active {
    background: var(--green);
    box-shadow: 0 0 8px rgba(50, 215, 75, 0.5);
  }
</style>
