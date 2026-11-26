export class GameAudio {
  constructor(onError) {
    this.onError = onError;
    this.settings = { music: true, effects: true };
    this.context = null;
    this.playing = false;
    this.beat = 0;
    this.beatTimer = 0;
    this.rainTimer = 0;
  }

  setSettings(settings) {
    this.settings = settings;
    if (this.context) {
      this.musicBus.gain.value = this.playing && settings.music ? 0.09 : 0;
      this.effectsBus.gain.value = settings.effects ? 0.3 : 0;
    }
  }

  async start() {
    this.playing = true;
    this.beat = 0;
    this.beatTimer = 0;
    this.rainTimer = 0;
    if (!this.settings.music && !this.settings.effects) return;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContext) throw new Error("Web Audio no está disponible en este navegador.");
        this.context = new AudioContext();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.connect(this.context.destination);
        this.effectsBus.connect(this.context.destination);
        this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      this.setSettings(this.settings);
      await this.context.resume();
    } catch (error) {
      this.onError(error);
    }
  }

  stop() {
    this.playing = false;
    if (this.context) this.musicBus.gain.value = 0;
  }

  async setVisible(visible) {
    if (!this.context) return;
    try {
      if (visible && this.playing) await this.context.resume();
      else await this.context.suspend();
    } catch (error) {
      this.onError(error);
    }
  }

  tone(frequency, duration, volume, bus, type = "triangle", delay = 0, endFrequency = frequency) {
    const context = this.context;
    const time = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  noise(duration, frequency, volume) {
    const context = this.context;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsBus);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
    source.stop(context.currentTime + duration);
  }

  tick(dt, raining) {
    if (!this.playing || this.context?.state !== "running") return;
    this.beatTimer -= dt;
    if (this.settings.music && this.beatTimer <= 0) {
      const melody = [60, 64, 67, 69, 67, 64, 62, 64, 57, 60, 64, 67, 64, 60, 59, 62];
      const midi = melody[this.beat % melody.length];
      this.tone(440 * 2 ** ((midi - 69) / 12), 0.18, 0.65, this.musicBus);
      if (this.beat % 4 === 0) this.tone(this.beat % 16 < 8 ? 130.81 : 110, 0.35, 0.5, this.musicBus, "sine");
      this.beat++;
      this.beatTimer = 0.23;
    }
    this.rainTimer -= dt;
    if (raining && this.settings.effects && this.rainTimer <= 0) {
      this.noise(0.3, 2200, 0.16);
      this.rainTimer = 0.2;
    }
  }

  effect(name) {
    if (!this.settings.effects || this.context?.state !== "running") return;
    const bus = this.effectsBus;
    switch (name) {
      case "horn":
        for (const delay of [0, 0.5]) {
          this.tone(349, 0.3, 0.4, bus, "sawtooth", delay);
          this.tone(440, 0.3, 0.25, bus, "triangle", delay);
        }
        break;
      case "collapse":
        this.noise(0.8, 550, 0.85);
        this.tone(110, 0.7, 0.8, bus, "sine", 0, 35);
        break;
      case "rattle":
      case "pothole":
        this.noise(0.2, 1400, 0.5);
        this.tone(180, 0.15, 0.3, bus, "triangle", 0, 75);
        break;
      case "open":
        this.tone(620, 0.28, 0.6, bus, "square", 0, 170);
        this.noise(0.22, 1800, 0.3);
        break;
      case "overflow":
      case "splash":
        this.noise(0.65, 1000, 0.65);
        for (let i = 0; i < 3; i++) this.tone(180 + i * 70, 0.2, 0.25, bus, "sine", i * 0.12, 80);
        break;
      case "crash":
        this.noise(0.75, 2800, 0.9);
        this.tone(160, 0.65, 0.9, bus, "sawtooth", 0, 35);
        break;
      default:
        throw new Error(`Efecto de sonido desconocido: ${name}`);
    }
  }
}
