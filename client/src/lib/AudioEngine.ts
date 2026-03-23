import * as Tone from 'tone';

export type ChannelStrip = {
  gain: Tone.Gain;
  panner: Tone.Panner;
  muteGate: Tone.Gain;
};

export type InputChannel = {
  deviceId: string;
  label: string;
  channelId: string;
  stream: MediaStream;
  recorder: MediaRecorder;
  sourceNode: Tone.UserMedia;
};

export class AudioEngine {
  private bpm: number = 120;
  private useWasmEncoder: boolean = false;
  private wasmEncoder: any = null;
  private audioContext: AudioContext | null = null;
  
  private clickSynth: Tone.MembraneSynth;

  // --- Channel strip graph ---
  private channelStrips: Map<string, ChannelStrip> = new Map();
  private masterGain: Tone.Gain | null = null;
  private metronomeGain: Tone.Gain | null = null;

  // --- Multi-input channels ---
  private inputChannels: Map<string, InputChannel> = new Map();
  private inputCounter: number = 0;

  // --- Synchronization & Latency ---
  private currentMeasureId: number = 0;
  private remotePlayQueue: Map<number, { id: string, data: ArrayBuffer }[]> = new Map();

  constructor() {
    // Ensure we have a master gain
    this.masterGain = new Tone.Gain(1).toDestination();
    
    // Metronome volume control
    this.metronomeGain = new Tone.Gain(0.8).connect(this.masterGain);

    // Organic/woodblock sounding synth
    this.clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.01 }
    }).connect(this.metronomeGain);

    Tone.Transport.scheduleRepeat((time) => {
      const position = Tone.Transport.position.toString().split(':'); // "bars:beats:sixteenths"
      const isDownbeat = position[1] === "0";
      
      // Metronome click on the beat (higher pitch on downbeat)
      this.clickSynth.triggerAttackRelease(isDownbeat ? "G4" : "C4", "32n", time, isDownbeat ? 1 : 0.5);
      
      // On the first beat of the measure (assuming 4/4 time), we capture the chunk
      if (position[1] === "0" && position[2] === "0") {
        this.onMeasureStart(time);
      }
    }, "4n");
  }

  // ---- Channel strip management ----

  private getToneMaster(): Tone.Gain {
    if (!this.masterGain) {
      this.masterGain = new Tone.Gain(1).toDestination();
    }
    return this.masterGain;
  }

  /**
   * Lazily create a channel strip: Tone.Gain → Tone.Panner → Tone.Gain(mute) → masterGain.
   */
  public ensureChannelStrip(id: string): ChannelStrip {
    if (this.channelStrips.has(id)) return this.channelStrips.get(id)!;

    const gain = new Tone.Gain(id.startsWith('input-') ? 0.8 : 0.75);
    const panner = new Tone.Panner(0);
    const muteGate = new Tone.Gain(1);

    // Wire: gain → panner → muteGate → master
    gain.connect(panner);
    panner.connect(muteGate);
    muteGate.connect(this.getToneMaster());

    const strip: ChannelStrip = { gain, panner, muteGate };
    this.channelStrips.set(id, strip);
    return strip;
  }

  public setMetronomeVolume(vol: number) {
    if (this.metronomeGain) {
      if (vol <= 0) {
        this.metronomeGain.gain.value = 0;
      } else {
        this.metronomeGain.gain.rampTo(vol / 100, 0.05);
      }
    }
  }

  /** Set volume (0–100) for a channel. */
  public setChannelVolume(id: string, vol: number) {
    const strip = this.ensureChannelStrip(id);
    strip.gain.gain.rampTo(vol / 100, 0.1);
  }

  /** Set pan (−1 to +1). */
  public setChannelPan(id: string, pan: number) {
    const strip = this.ensureChannelStrip(id);
    strip.panner.pan.rampTo(pan, 0.1);
  }

  /** Set the mute gate (0 or 1). */
  public setChannelMuteGate(id: string, value: 0 | 1) {
    const strip = this.ensureChannelStrip(id);
    strip.muteGate.gain.rampTo(value, 0.1);
  }

  /** Remove a channel strip when a peer disconnects. */
  public removeChannelStrip(id: string) {
    const strip = this.channelStrips.get(id);
    if (strip) {
      strip.gain.dispose();
      strip.panner.dispose();
      strip.muteGate.dispose();
      this.channelStrips.delete(id);
    }
  }

  /** Convenience: get a reference to a strip (for connecting sources). */
  public getChannelStrip(id: string): ChannelStrip | undefined {
    return this.channelStrips.get(id);
  }

  public setBpm(newBpm: number) {
    Tone.Transport.bpm.value = newBpm;
  }

  // ---- Multi-input management ----

  /** List all audio input devices available on this machine. */
  public async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      // First attempt to get a stream to force permission prompt, then stop it immediately.
      // This ensures labels are visible in enumerateDevices.
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch (err) {
      console.warn('Microphone permission not granted yet:', err);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default');
  }

  /** Get the current list of active input channels. */
  public getInputChannels(): InputChannel[] {
    return Array.from(this.inputChannels.values());
  }

  /**
   * Add a new local input channel for a specific audio device.
   */
  public async addInputChannel(deviceId: string, label: string): Promise<string> {
    const channelId = `input-${this.inputCounter++}`;
    await Tone.start();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      });

      // To connect a raw MediaStream to Tone.js, we use the raw context
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const rawSource = rawCtx.createMediaStreamSource(stream);
      
      const strip = this.ensureChannelStrip(channelId);
      Tone.connect(rawSource, strip.gain);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
        ? 'audio/webm; codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log(`[Audio] Sending chunk for measure ${this.currentMeasureId} (${e.data.size} bytes)`);
          import('./NetworkManager').then(m => m.network.sendAudioChunk(e.data, this.currentMeasureId));
        }
      };
      recorder.start();
      console.log(`[Audio] Recording started for ${label}`);

      const input: InputChannel = { deviceId, label, channelId, stream, recorder, sourceNode: new Tone.UserMedia() };
      this.inputChannels.set(channelId, input);

      return channelId;
    } catch (err) {
      console.error(`[AudioEngine] Failed to add input "${label}":`, err);
      throw err;
    }
  }

  /** Change the device for an existing input channel. */
  public async updateInputDevice(channelId: string, deviceId: string, label: string) {
    const oldInput = this.inputChannels.get(channelId);
    if (oldInput) {
      try { oldInput.recorder.stop(); } catch {}
      oldInput.stream.getTracks().forEach(t => t.stop());
      this.inputChannels.delete(channelId);
    }
    
    if (!deviceId) {
      console.log(`[AudioEngine] Channel ${channelId} set to no input`);
      return; 
    }
    
    await Tone.start();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const rawSource = rawCtx.createMediaStreamSource(stream);
      const strip = this.ensureChannelStrip(channelId);
      Tone.connect(rawSource, strip.gain);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
        ? 'audio/webm; codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          import('./NetworkManager').then(m => m.network.sendAudioChunk(e.data, this.currentMeasureId));
        }
      };
      recorder.start();

      const input: InputChannel = { deviceId, label, channelId, stream, recorder, sourceNode: new Tone.UserMedia() };
      this.inputChannels.set(channelId, input);
    } catch (err) {
      console.error(`[AudioEngine] Failed to update device for ${channelId}:`, err);
    }
  }

  /** Remove an input channel, stopping its stream and recorder. */
  public removeInputChannel(channelId: string) {
    const input = this.inputChannels.get(channelId);
    if (!input) return;

    try { input.recorder.stop(); } catch { /* already stopped */ }
    input.stream.getTracks().forEach(t => t.stop());
    this.removeChannelStrip(channelId);
    this.inputChannels.delete(channelId);
    console.log(`[AudioEngine] Input ${channelId} removed`);
  }

  public async startMetronome(startTime?: number) {
    await Tone.start();
    console.log(`[Audio] Transport Start. Context State: ${Tone.getContext().state}`);
    this.currentMeasureId = 0; // Reset sync on start
    this.remotePlayQueue.clear();
    
    if (startTime !== undefined) {
      Tone.Transport.start(startTime);
    } else {
      Tone.Transport.start();
    }
    
    // Auto-add default mic input if no inputs exist yet AND user has not manually removed them
    if (this.inputChannels.size === 0 && this.inputCounter === 0) {
      try {
        const devices = await this.getAudioInputDevices();
        if (devices.length > 0) {
          await this.addInputChannel(devices[0].deviceId, devices[0].label || 'Default Input');
        }
      } catch (err) {
        console.warn('[AudioEngine] Could not auto-add default mic:', err);
      }
    }
  }

  public stopMetronome() {
    Tone.Transport.stop();
  }

  private onMeasureStart(time: number) {
    // 1. Play chunks recorded 2 measures ago to ensure they have arrived over the network (2-measure latency loop)
    const playbackMeasureId = Math.max(0, this.currentMeasureId - 2); 
    const chunksToPlay = this.remotePlayQueue.get(playbackMeasureId);
    
    if (chunksToPlay && this.currentMeasureId >= 2) {
      for (const item of chunksToPlay) {
        console.log(`[AudioEngine] Playing remote chunk for measure ${playbackMeasureId} from ${item.id}`);
        this.playRemoteChunk(item.id, item.data, time);
      }
      this.remotePlayQueue.delete(playbackMeasureId);
    }

    // Clean up ancient chunks (e.g. dropped out or received super late)
    for (const key of this.remotePlayQueue.keys()) {
      if (key < playbackMeasureId) {
        this.remotePlayQueue.delete(key);
      }
    }

    // Capture the ID for the data we are about to FLUSH (the measure that just ended)
    const finishedMeasureId = this.currentMeasureId;

    // 2. Increment Measure ID for the NEXT recording chunk (Measure that is starting NOW)
    this.currentMeasureId++;

    // 3. Cycle recorders to ensure fresh WebM headers for every 1-measure chunk
    for (const input of this.inputChannels.values()) {
      if (input.recorder.state === 'recording') {
        try {
          // We must ensure the ondataavailable for THIS stop uses finishedMeasureId
          // The current handler uses this.currentMeasureId, which is now N+1.
          // Let's re-bind the handler temporarily or use a local closure.
          const oldHandler = input.recorder.ondataavailable;
          input.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              import('./NetworkManager').then(m => m.network.sendAudioChunk(e.data, finishedMeasureId));
            }
          };
          input.recorder.stop();
          input.recorder.start();
          console.log(`[Audio] Cycled recorder for ${input.label}`);
          // Restore handler for the newly started recording (which will use the new this.currentMeasureId)
          setTimeout(() => { input.recorder.ondataavailable = oldHandler; }, 50);
        } catch (e) {
          console.error('[AudioEngine] Recorder cycle error:', e);
        }
      }
    }
  }

  /** Store incoming audio for synchronized playback later. */
  public queueRemoteAudio(senderId: string, data: ArrayBuffer, measureId: number) {
    if (!this.remotePlayQueue.has(measureId)) {
      this.remotePlayQueue.set(measureId, []);
    }
    this.remotePlayQueue.get(measureId)!.push({ id: senderId, data });
  }

  /**
   * Play a received WebM/Opus audio chunk from a remote peer.
   * Uses an Audio element + Blob URL because the browser's native decoder
   * handles streaming WebM segments, whereas decodeAudioData needs a
   * complete audio file.
   */
  public playRemoteChunk(id: string, audioData: ArrayBuffer, startTime?: number) {
    try {
      const blob = new Blob([audioData], { type: 'audio/webm; codecs=opus' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const source = rawCtx.createMediaElementSource(audio);
      const strip = this.ensureChannelStrip(id);
      Tone.connect(source, strip.gain);

      // If a startTime is provided (Measure boundary), we play it then.
      // Otherwise it plays immediately (though our queue logic shouldn't do this).
      if (startTime !== undefined) {
        const delay = startTime - Tone.now();
        if (delay > 0) {
          setTimeout(() => audio.play().catch(() => {}), delay * 1000);
        } else {
          audio.play().catch(() => {});
        }
      } else {
        audio.play().catch(() => {});
      }
      
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AudioEngine] Error playing remote chunk:', err);
    }
  }

  public simulateRemoteBeep(id: string, playAtTime: number) {
    const strip = this.ensureChannelStrip(id);
    const synth = new Tone.Synth({ oscillator: { type: "sine" } }).connect(strip.gain);
    synth.triggerAttackRelease("E5", "16n", playAtTime);
    // Auto-dispose after a second to clean up
    setTimeout(() => synth.dispose(), 1000);
  }
}

export const engine = new AudioEngine();
