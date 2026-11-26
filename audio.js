const RECORDINGS = {
  rain: new URL("./assets/audio/rain.mp3", import.meta.url).href,
  horn: new URL("./assets/audio/horn.mp3", import.meta.url).href,
  crash: new URL("./assets/audio/crash.mp3", import.meta.url).href,
  open: new URL("./assets/audio/manhole-open.mp3", import.meta.url).href,
  rattle: new URL("./assets/audio/manhole-rattle.mp3", import.meta.url).href,
  collapse: new URL("./assets/audio/collapse.mp3", import.meta.url).href,
  driving: new URL("./assets/audio/driving-music.mp3", import.meta.url).href,
  regional: new URL("./assets/audio/regional-music.mp3", import.meta.url).href,
  chase: new URL("./assets/audio/chase-music.mp3", import.meta.url).href,
  siren: new URL("./assets/audio/police-siren.mp3", import.meta.url).href,
  "voice-1": new URL("./assets/audio/voice-1.mp3", import.meta.url).href,
  "voice-2": new URL("./assets/audio/voice-2.mp3", import.meta.url).href,
  "voice-3": new URL("./assets/audio/voice-3.mp3", import.meta.url).href,
  "voice-4": new URL("./assets/audio/voice-4.mp3", import.meta.url).href,
  "voice-5": new URL("./assets/audio/voice-5.mp3", import.meta.url).href,
  "voice-6": new URL("./assets/audio/voice-6.mp3", import.meta.url).href,
  "overtake-voice-1": new URL("./assets/audio/overtake-voice-1.mp3", import.meta.url).href,
  "overtake-voice-2": new URL("./assets/audio/overtake-voice-2.mp3", import.meta.url).href
};
const VOICES = [
  { name: "voice-1", duration: 1.8 },
  { name: "voice-2", duration: 3.24 },
  { name: "voice-3", duration: 5.15 },
  { name: "voice-4", duration: 2.69 },
  { name: "voice-5", duration: 2.12 },
  { name: "voice-6", duration: 1.72 }
];
const OVERTAKE_VOICES = ["overtake-voice-1", "overtake-voice-2"];
// Preserve the original tune's level on the recorded-music bus.
const ORIGINAL_MUSIC_VOLUME = 0.09 / 0.16;
// Match the quieter polka recording to Driving without raising the shared music bus.
const REGIONAL_MUSIC_VOLUME = 2.3;
export const RADIO_STATIONS = [
  { id: "regional", label: "Regional" },
  { id: "original", label: "Original" },
  { id: "driving", label: "Driving" }
];

export class GameAudio {
  constructor(onError) {
    this.onError = onError;
    this.settings = { music: true, effects: true };
    this.context = null;
    this.playing = false;
    this.music = null;
    this.station = RADIO_STATIONS[0].id;
    this.beat = 0;
    this.beatTimer = 0;
    this.musicSources = new Set();
    this.siren = null;
    this.buffers = new Map();
    this.loadPromise = null;
    this.sources = new Set();
    this.rain = null;
    this.generation = 0;
    this.listener = null;
    this.spatialSounds = new Map();
    this.removedEmitters = new WeakSet();
  }

  setListener(listener) {
    this.listener = listener;
  }

  setStation(station) {
    if (!RADIO_STATIONS.some(candidate => candidate.id === station)) {
      throw new Error(`Estación de radio desconocida: ${station}`);
    }
    this.station = station;
  }

  proximityVolume(emitter) {
    if (!this.listener) throw new Error("No se configuró el receptor del audio de proximidad.");
    const distance = Math.hypot(
      emitter.position.x - this.listener.position.x,
      emitter.position.y - this.listener.position.y,
      emitter.position.z - this.listener.position.z
    );
    return 1 / (1 + Math.max(0, distance - 4) / 12);
  }

  connectOutput(source, gain, bus, emitter = null, filter = null) {
    let spatialGain = null;
    if (emitter) {
      spatialGain = this.context.createGain();
      spatialGain.gain.value = this.proximityVolume(emitter);
      gain.connect(spatialGain);
      spatialGain.connect(bus);
      this.spatialSounds.set(source, { emitter, gain: spatialGain });
    } else {
      gain.connect(bus);
    }
    if (bus === this.effectsBus) this.sources.add(source);
    if (bus === this.musicBus) this.musicSources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.musicSources.delete(source);
      this.spatialSounds.delete(source);
      source.disconnect();
      gain.disconnect();
      spatialGain?.disconnect();
      filter?.disconnect();
    };
  }

  stopEmitter(emitter) {
    this.removedEmitters.add(emitter);
    if (this.siren?.emitter === emitter) this.siren = null;
    for (const [source, sound] of this.spatialSounds) {
      if (sound.emitter !== emitter) continue;
      source.stop();
      this.sources.delete(source);
      this.spatialSounds.delete(source);
    }
  }

  setSettings(settings) {
    this.settings = settings;
    if (this.context) {
      this.musicBus.gain.value = this.playing && settings.music ? 0.16 : 0;
      this.effectsBus.gain.value = settings.effects ? 0.3 : 0;
      if (!settings.effects) this.stopRecordings();
      if (!settings.music) this.stopMusic();
    }
  }

  async start() {
    this.stopRecordings();
    this.stopMusic();
    this.playing = true;
    this.generation++;
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
      await this.loadRecordings();
    } catch (error) {
      this.onError(error);
    }
  }

  stop() {
    this.playing = false;
    this.generation++;
    if (this.context) this.musicBus.gain.value = 0;
    this.stopRecordings();
    this.stopMusic();
  }

  async loadRecordings() {
    if (this.buffers.size === Object.keys(RECORDINGS).length) return;
    if (!this.loadPromise) {
      this.loadPromise = Promise.all(Object.entries(RECORDINGS).map(async ([name, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`No se pudo cargar el sonido ${name}: HTTP ${response.status}.`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        return [name, buffer];
      })).then(entries => {
        this.buffers = new Map(entries);
      }).finally(() => {
        this.loadPromise = null;
      });
    }
    await this.loadPromise;
  }

  recording(name, volume = 1, loop = false, delay = 0, emitter = null, bus = this.effectsBus) {
    const buffer = this.buffers.get(name);
    if (!buffer) throw new Error(`La grabación ${name} no está cargada.`);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    this.connectOutput(source, gain, bus, emitter);
    source.start(this.context.currentTime + delay, name === "chase" ? 1 : 0);
    return { source, gain };
  }

  stopRecordings() {
    this.rain = null;
    this.siren = null;
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.spatialSounds.clear();
  }

  stopMusic() {
    this.music = null;
    for (const source of this.musicSources) source.stop();
    this.musicSources.clear();
  }

  updateMusic(emitter) {
    const name = emitter ? "chase" : this.station;
    if (!this.settings.music || (name !== "original" && !this.buffers.has(name)) || this.music?.name === name) return;
    const time = this.context.currentTime;
    if (this.music?.source) {
      const parameter = this.music.gain.gain;
      parameter.cancelScheduledValues(time);
      parameter.setValueAtTime(parameter.value, time);
      parameter.linearRampToValueAtTime(0, time + 0.3);
      this.music.source.stop(time + 0.3);
    } else if (this.music) {
      this.stopMusic();
    }
    if (name === "original") {
      this.music = { name, source: null, gain: null };
      this.beat = 0;
      this.beatTimer = 0;
      return;
    }
    const music = this.recording(name, 0, true, 0, null, this.musicBus);
    music.gain.gain.setValueAtTime(0, time);
    const volume = name === "chase" ? 1.2 : name === "regional" ? REGIONAL_MUSIC_VOLUME : 0.85;
    music.gain.gain.linearRampToValueAtTime(volume, time + 0.4);
    this.music = { ...music, name };
  }

  playOriginal(dt) {
    this.beatTimer -= dt;
    if (this.beatTimer > 0) return;
    const melody = [60, 64, 67, 69, 67, 64, 62, 64, 57, 60, 64, 67, 64, 60, 59, 62];
    const midi = melody[this.beat % melody.length];
    this.tone(440 * 2 ** ((midi - 69) / 12), 0.18, 0.65 * ORIGINAL_MUSIC_VOLUME, this.musicBus);
    if (this.beat % 4 === 0) this.tone(this.beat % 16 < 8 ? 130.81 : 110, 0.35, 0.5 * ORIGINAL_MUSIC_VOLUME, this.musicBus, "sine");
    this.beat++;
    this.beatTimer = 0.23;
  }

  async recordedEffect(name, delay = 0, emitter = null) {
    const generation = this.generation;
    try {
      await this.loadRecordings();
      if (generation !== this.generation || !this.settings.effects || this.context.state !== "running") return;
      if (emitter && this.removedEmitters.has(emitter)) return;
      this.recording(name, name === "horn" ? 2 : name.includes("voice-") ? 0.85 : 1.5, false, delay, emitter);
    } catch (error) {
      this.onError(error);
    }
  }

  playVoice(delay = 0, random = Math.random, emitter = null) {
    const voice = VOICES[Math.floor(random() * VOICES.length)];
    this.effect(voice.name, delay, emitter);
    return voice.duration;
  }

  playOvertakeVoice(delay = 1.6, random = Math.random, emitter = null) {
    const name = OVERTAKE_VOICES[Math.floor(random() * OVERTAKE_VOICES.length)];
    this.effect(name, delay, emitter);
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

  tone(frequency, duration, volume, bus, type = "triangle", delay = 0, endFrequency = frequency, emitter = null) {
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
    this.connectOutput(oscillator, gain, bus, emitter);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  noise(duration, frequency, volume, emitter = null) {
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
    this.connectOutput(source, gain, this.effectsBus, emitter, filter);
    source.start();
    source.stop(context.currentTime + duration);
  }

  tick(dt, raining, pursuitEmitter = null) {
    if (!this.playing || this.context?.state !== "running") return;
    const time = this.context.currentTime;
    for (const sound of this.spatialSounds.values()) {
      const parameter = sound.gain.gain;
      parameter.cancelScheduledValues(time);
      parameter.setValueAtTime(parameter.value, time);
      parameter.linearRampToValueAtTime(this.proximityVolume(sound.emitter), time + 0.05);
    }
    this.updateMusic(pursuitEmitter);
    if (this.music?.name === "original" && !pursuitEmitter) this.playOriginal(dt);
    if (pursuitEmitter && this.settings.effects && this.buffers.has("siren") && this.siren?.emitter !== pursuitEmitter) {
      this.siren?.source.stop();
      this.siren = { ...this.recording("siren", 4, true, 0, pursuitEmitter), emitter: pursuitEmitter };
    } else if (!pursuitEmitter && this.siren) {
      this.siren.source.stop();
      this.siren = null;
    }
    if (raining && this.settings.effects && !this.rain && this.buffers.has("rain")) {
      this.rain = this.recording("rain", 0, true);
      const time = this.context.currentTime;
      this.rain.gain.gain.setValueAtTime(0, time);
      this.rain.gain.gain.linearRampToValueAtTime(0.85, time + 1);
    } else if (!raining && this.rain) {
      const time = this.context.currentTime;
      this.rain.gain.gain.cancelScheduledValues(time);
      this.rain.gain.gain.setValueAtTime(this.rain.gain.gain.value, time);
      this.rain.gain.gain.linearRampToValueAtTime(0, time + 0.5);
      this.rain.source.stop(time + 0.5);
      this.rain = null;
    }
  }

  effect(name, delay = 0, emitter = null) {
    if (!this.settings.effects || this.context?.state !== "running") return;
    const bus = this.effectsBus;
    switch (name) {
      case "horn":
      case "crash":
      case "voice-1":
      case "voice-2":
      case "voice-3":
      case "voice-4":
      case "voice-5":
      case "voice-6":
      case "overtake-voice-1":
      case "overtake-voice-2":
      case "open":
      case "rattle":
      case "collapse":
        void this.recordedEffect(name, delay, emitter);
        break;
      case "pothole":
        this.noise(0.2, 1400, 0.5, emitter);
        this.tone(180, 0.15, 0.3, bus, "triangle", 0, 75, emitter);
        break;
      case "overflow":
      case "splash":
        this.noise(0.65, 1000, 0.65, emitter);
        for (let i = 0; i < 3; i++) this.tone(180 + i * 70, 0.2, 0.25, bus, "sine", i * 0.12, 80, emitter);
        break;
      default:
        throw new Error(`Efecto de sonido desconocido: ${name}`);
    }
  }
}
