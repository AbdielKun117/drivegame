import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "./audio.js";

function audioFixture(t, fetchRecording = async url => ({
  ok: true,
  arrayBuffer: async () => url
})) {
  class Context {
    constructor() {
      this.sampleRate = 8;
      this.currentTime = 0;
      this.state = "suspended";
      this.destination = {};
      this.sources = [];
    }
    createGain() {
      const parameter = {
        value: 0,
        setValueAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value) { this.value = value; },
        cancelScheduledValues() {}
      };
      return { gain: parameter, connect() {}, disconnect() {} };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
    async decodeAudioData(url) { return { url, duration: 2 }; }
    async resume() { this.state = "running"; }
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start(time) { this.started = true; this.startTime = time; },
        stop(time) { this.stopTime = time; this.stopped = true; this.onended?.(); }
      };
      this.sources.push(source);
      return source;
    }
  }
  const previousContext = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => {
    if (previousContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousContext;
  });
  t.mock.method(globalThis, "fetch", fetchRecording);
  const errors = [];
  const audio = new GameAudio(error => errors.push(error));
  audio.setListener({ position: { x: 0, y: 0, z: 3 } });
  audio.setSettings({ music: false, effects: true });
  return { audio, errors };
}

test("recordings replace the horn and crash oscillators, and rain uses one continuous loop", async t => {
  const { audio, errors } = audioFixture(t);
  await audio.start();
  await audio.recordedEffect("horn");
  await audio.recordedEffect("crash");
  assert.ok(audio.context.sources[0].buffer.url.endsWith("horn.mp3"));
  assert.ok(audio.context.sources[1].buffer.url.endsWith("crash.mp3"));
  for (let i = 0; i < 20; i++) audio.tick(0.05, true);
  const rain = audio.context.sources[2];
  assert.ok(rain.buffer.url.endsWith("rain.mp3"));
  assert.equal(rain.loop, true);
  assert.equal(audio.context.sources.length, 3);
  audio.tick(0.05, false);
  assert.equal(rain.stopTime, 0.5);
  audio.stop();
  assert.ok(audio.context.sources.every(source => source.stopped));
  assert.deepEqual(errors, []);
});

test("muting effects stops rain and meme voices while a final recorded crash still works after stop", async t => {
  const { audio } = audioFixture(t);
  await audio.start();
  audio.tick(0.05, true);
  await audio.recordedEffect("voice-1");
  audio.setSettings({ music: false, effects: false });
  assert.ok(audio.context.sources.every(source => source.stopped));
  await audio.recordedEffect("horn");
  assert.equal(audio.context.sources.length, 2);
  audio.setSettings({ music: false, effects: true });
  audio.stop();
  await audio.recordedEffect("crash");
  assert.ok(audio.context.sources.at(-1).buffer.url.endsWith("crash.mp3"));
  assert.equal(audio.context.sources.at(-1).stopped, undefined);
  await audio.start();
  assert.equal(audio.context.sources.at(-1).stopped, true);
});

test("a failed audio download is reported rather than replaced by a synthetic sound", async t => {
  const { audio, errors } = audioFixture(t, async () => ({ ok: false, status: 404 }));
  await audio.start();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /HTTP 404/);
  assert.equal(audio.context.sources.length, 0);
});

test("each supplied voice can be randomly chosen and delayed without surviving a menu return", async t => {
  const { audio } = audioFixture(t);
  await audio.start();
  for (const roll of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) {
    audio.playVoice(1.6, () => roll);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(audio.context.sources.map(source => source.buffer.url.split("/").at(-1)),
    ["voice-1.mp3", "voice-2.mp3", "voice-3.mp3", "voice-4.mp3", "voice-5.mp3", "voice-6.mp3"]);
  assert.ok(audio.context.sources.every(source => source.startTime === 1.6));
  audio.stop();
  assert.ok(audio.context.sources.every(source => source.stopped));
});

test("overtaking traffic uses only its two dedicated voices, not the six woman's voices", async t => {
  const { audio } = audioFixture(t);
  await audio.start();
  for (const roll of [0, 0.99]) {
    audio.playOvertakeVoice(1.6, () => roll);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.deepEqual(audio.context.sources.map(source => source.buffer.url.split("/").at(-1)),
    ["overtake-voice-1.mp3", "overtake-voice-2.mp3"]);
});

test("recorded lid and collapse sounds grow closer, recede after passing, and follow the listener", async t => {
  const { audio, errors } = audioFixture(t);
  await audio.start();
  const emitter = { position: { x: 0, y: 0, z: -45 } };
  for (const name of ["open", "collapse", "rattle"]) await audio.recordedEffect(name, 0, emitter);
  assert.deepEqual(audio.context.sources.map(source => source.buffer.url.split("/").at(-1)),
    ["manhole-open.mp3", "collapse.mp3", "manhole-rattle.mp3"]);
  const source = audio.context.sources[0];
  const parameter = audio.spatialSounds.get(source).gain.gain;
  const distant = parameter.value;
  emitter.position.z = 3;
  audio.tick(0.05, false);
  const nearby = parameter.value;
  assert.ok(nearby > distant * 3);
  emitter.position.z = 55;
  audio.tick(0.05, false);
  assert.ok(parameter.value < nearby / 3);
  audio.listener.position.z = 55;
  audio.tick(0.05, false);
  assert.equal(parameter.value, nearby);
  audio.stopEmitter(emitter);
  assert.ok(audio.context.sources.every(sound => sound.stopped));
  assert.equal(audio.spatialSounds.size, 0);
  assert.deepEqual(errors, []);
});

test("an emitter removed during loading cannot play a delayed ghost sound", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { audio } = audioFixture(t, async url => ({ ok: true, arrayBuffer: async () => { await gate; return url; } }));
  const start = audio.start();
  await Promise.resolve();
  const emitter = { position: { x: 0, y: 0, z: 44 } };
  const effect = audio.recordedEffect("horn", 1.6, emitter);
  audio.stopEmitter(emitter);
  release();
  await start;
  await effect;
  assert.equal(audio.context.sources.length, 0);
});
