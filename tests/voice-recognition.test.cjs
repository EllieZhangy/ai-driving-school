const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../voice-recognition.js"), "utf8");
const workletSource = fs.readFileSync(path.join(__dirname, "../voice-audio-worklet.js"), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ modelPending = false, micPending = false, libraryPending = false } = {}) {
  const contexts = [];
  const models = [];
  const recognizers = [];
  const tracks = [];
  const nodes = [];
  const scripts = [];
  const timers = new Map();
  let timerID = 0;
  const mic = deferred();
  class Track extends EventTarget {
    constructor() { super(); this.stops = 0; tracks.push(this); }
    stop() { this.stops += 1; }
  }
  function newStream() {
    const track = new Track();
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  }
  class Context extends EventTarget {
    constructor() {
      super();
      this.sampleRate = 48000;
      this.state = "suspended";
      this.closes = 0;
      this.destination = {};
      this.audioWorklet = { addModule: async (url) => { this.workletURL = url; } };
      contexts.push(this);
    }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { this.closes += 1; this.state = "closed"; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  }
  class WorkletNode extends EventTarget {
    constructor(context, name) {
      super();
      this.context = context;
      this.name = name;
      this.port = { onmessage: null, close() {} };
      nodes.push(this);
    }
    connect() {}
    disconnect() {}
  }
  class Recognizer {
    constructor(rate, grammar) {
      this.rate = rate;
      this.grammar = JSON.parse(grammar);
      this.handlers = {};
      this.removes = 0;
      this.waveforms = [];
      recognizers.push(this);
    }
    setWords(value) { this.words = value; }
    on(name, handler) { this.handlers[name] = handler; }
    emit(name, result) { this.handlers[name]?.({ result }); }
    remove() { this.removes += 1; }
    acceptWaveformFloat(samples, rate) { this.waveforms.push({ samples, rate }); }
  }
  class Model extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.ready = false;
      this.handlers = {};
      this.KaldiRecognizer = Recognizer;
      this.terminates = 0;
      models.push(this);
      if (!modelPending) queueMicrotask(() => this.load());
    }
    on(name, handler) { this.handlers[name] = handler; }
    load() { this.ready = true; this.handlers.load({ result: true }); }
    terminate() { this.terminates += 1; }
  }
  const Vosk = { Model, createModel() {} };
  const window = {
    AudioContext: Context,
    AudioWorkletNode: WorkletNode,
    Worker: function Worker() {},
    WebAssembly,
    Vosk: libraryPending ? null : Vosk,
  };
  const context = vm.createContext({
    window, AudioWorkletNode: WorkletNode, DOMException, URL,
    setTimeout(callback, delay) { const id = ++timerID; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      currentScript: { src: "https://example.test/game/voice-recognition.js" },
      baseURI: "https://example.test/game/",
      createElement() { return { remove() { this.removed = true; } }; },
      head: { appendChild(script) { scripts.push(script); } },
    },
    navigator: { mediaDevices: { getUserMedia() { return micPending ? mic.promise : Promise.resolve(newStream()); } } },
  });
  vm.runInContext(source, context);
  function fireTimers(delay) {
    for (const [id, timer] of [...timers]) {
      if (timer.delay <= delay) {
        timers.delete(id);
        timer.callback();
      }
    }
  }
  function loadLibrary() { window.Vosk = Vosk; scripts.at(-1).onload(); }
  return { api: window.ParkingSpeech, contexts, models, recognizers, tracks, nodes, mic, newStream, timers, fireTimers, scripts, loadLibrary };
}

test("cancelling during model loading immediately releases audio and keeps the shared model", async () => {
  const h = harness({ modelPending: true });
  const abort = new AbortController();
  const pending = h.api.start({ signal: abort.signal });
  await tick();
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(h.contexts[0].closes, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.models[0].terminates, 0);
  h.models[0].load();
  assert.equal(await h.api.prepare(), h.models[0]);
});

test("microphone permission resolving after cancellation cannot leave a live track", async () => {
  const h = harness({ micPending: true });
  const abort = new AbortController();
  const pending = h.api.start({ signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const stream = h.newStream();
  h.mic.resolve(stream);
  await tick();
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.contexts[0].state, "closed");
});

test("partials and final share an utterance id, use the real sample rate, and stop releases resources", async () => {
  const h = harness();
  const texts = [];
  const controller = await h.api.start({ onText: (text, meta) => texts.push({ text, meta }) });
  const recognizer = h.recognizers[0];
  assert.equal(recognizer.rate, 48000);
  assert.equal(recognizer.words, true);
  assert.ok(recognizer.grammar.includes("停"));
  assert.ok(recognizer.grammar.includes("倒"));
  assert.ok(recognizer.grammar.includes("不要 倒车"));
  assert.ok(recognizer.grammar.includes("[unk]"));
  recognizer.emit("partialresult", { partial: "停" });
  recognizer.emit("partialresult", { partial: "停" });
  recognizer.emit("result", { text: "停", result: [{ conf: 0.8 }, { conf: 1 }] });
  recognizer.emit("partialresult", { partial: "倒" });
  assert.equal(texts.length, 3);
  assert.equal(texts[0].meta.id, texts[1].meta.id);
  assert.notEqual(texts[1].meta.id, texts[2].meta.id);
  assert.equal(texts[1].meta.confidence, 0.9);
  h.nodes[0].port.onmessage({ data: { type: "audio", samples: new Float32Array(1024) } });
  assert.equal(recognizer.waveforms[0].rate, 48000);
  controller.stop();
  controller.stop();
  recognizer.emit("partialresult", { partial: "前进" });
  assert.equal(texts.length, 3);
  assert.equal(recognizer.removes, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.contexts[0].closes, 1);
  assert.equal(h.models[0].terminates, 0);
});

test("model failure rejects startup and releases an already granted microphone", async () => {
  const h = harness({ modelPending: true });
  const errors = [];
  const pending = h.api.start({ onError: (error) => errors.push(error) });
  await tick();
  h.models[0].handlers.error({ error: "Download failed" });
  await assert.rejects(pending, /Download failed/);
  assert.equal(errors.length, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.contexts[0].closes, 1);
  assert.equal(h.models[0].terminates, 1);
  assert.equal(h.timers.size, 0);
});

test("model timeout releases capture and retry creates a fresh model", async () => {
  const h = harness({ modelPending: true });
  const errors = [];
  const pending = h.api.start({ onError: (error) => errors.push(error) });
  await tick();
  h.fireTimers(90000);
  await assert.rejects(pending, /initialization timed out/);
  assert.equal(errors.length, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.contexts[0].state, "closed");
  assert.equal(h.models[0].terminates, 1);
  assert.equal(h.timers.size, 0);
  const retry = h.api.start();
  await tick();
  assert.equal(h.models.length, 2);
  h.models[1].load();
  const controller = await retry;
  assert.equal(h.recognizers.length, 1);
  assert.equal(h.timers.size, 0);
  controller.stop();
});

test("library timeout removes the failed script, releases capture, and allows a fresh download", async () => {
  const h = harness({ libraryPending: true });
  const pending = h.api.start();
  await tick();
  assert.equal(h.models.length, 0);
  h.fireTimers(60000);
  await assert.rejects(pending, /library download timed out/);
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.scripts[0].onload, null);
  assert.equal(h.scripts[0].onerror, null);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.contexts[0].state, "closed");
  assert.equal(h.timers.size, 0);
  const retry = h.api.start();
  await tick();
  assert.equal(h.scripts.length, 2);
  h.loadLibrary();
  const controller = await retry;
  assert.equal(h.models.length, 1);
  assert.equal(h.timers.size, 0);
  controller.stop();
});

test("a late load after timeout cannot repopulate the model cache", async () => {
  const h = harness({ modelPending: true });
  const first = h.api.prepare();
  await tick();
  const expired = h.models[0];
  h.fireTimers(90000);
  await assert.rejects(first, /initialization timed out/);
  expired.load();
  expired.handlers.error({ error: "Late error" });
  const retry = h.api.prepare();
  await tick();
  assert.equal(h.models.length, 2);
  h.models[1].load();
  assert.equal(await retry, h.models[1]);
  assert.equal(h.models[0].terminates, 1);
});

test("microphone disconnect stops the active session and reports one failure", async () => {
  const h = harness();
  const errors = [];
  await h.api.start({ onError: (error) => errors.push(error) });
  h.tracks[0].dispatchEvent(new Event("ended"));
  assert.equal(errors.length, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.recognizers[0].removes, 1);
  assert.equal(h.contexts[0].state, "closed");
});

test("an interrupted audio context stops capture", async () => {
  const h = harness();
  const errors = [];
  await h.api.start({ onError: (error) => errors.push(error) });
  h.contexts[0].state = "suspended";
  h.contexts[0].dispatchEvent(new Event("statechange"));
  assert.equal(errors.length, 1);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.recognizers[0].removes, 1);
});

test("a stopped session reuses the downloaded model for the next teaching session", async () => {
  const h = harness();
  const first = await h.api.start();
  first.stop();
  const second = await h.api.start();
  assert.equal(h.models.length, 1);
  assert.equal(h.recognizers.length, 2);
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.tracks[1].stops, 0);
  second.stop();
});

test("worklet failure stops the microphone and reports the failure", async () => {
  const h = harness();
  const errors = [];
  await h.api.start({ onError: (error) => errors.push(error) });
  h.nodes[0].dispatchEvent(new Event("processorerror"));
  assert.equal(errors.length, 1);
  assert.equal(h.tracks[0].stops, 1);
});

test("the audio worklet batches 1024 input samples and outputs silence", () => {
  const blocks = [];
  let Processor;
  class Base {
    constructor() { this.port = { postMessage: (message) => blocks.push(message) }; }
  }
  vm.runInNewContext(workletSource, {
    AudioWorkletProcessor: Base,
    registerProcessor(name, implementation) { assert.equal(name, "parking-voice-audio"); Processor = implementation; },
  });
  const processor = new Processor();
  for (let index = 0; index < 8; index += 1) {
    const input = new Float32Array(128).fill(index / 10);
    const output = new Float32Array(128).fill(1);
    assert.equal(processor.process([[input]], [[output]]), true);
    assert.ok(output.every((value) => value === 0));
  }
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].samples.length, 1024);
  assert.equal(blocks[0].samples[0], 0);
  assert.ok(Math.abs(blocks[0].samples[1023] - 0.7) < 0.0001);
});
