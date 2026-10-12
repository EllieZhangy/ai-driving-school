const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Exercise game state with a minimal browser adapter; real device tests are separate.
function loadGame({ width = 390, recognition = false } = {}) {
  const noop = () => {};
  const elements = new Map();
  const utterances = [];
  let recognizer;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'difficultySelect' ? '0.08' : id === 'demoSpeed' ? '1' : '',
      hidden: false, textContent: '', innerHTML: '', listeners: {},
      classList: { add: noop, remove: noop }, setAttribute: noop,
      addEventListener(type, action) { this.listeners[type] = action; },
      querySelector: () => ({ textContent: '', remove: noop }), appendChild: noop,
      setPointerCapture: noop, focus: noop,
      getContext: () => new Proxy({}, {
        get: (o, k) => o[k] || (k.startsWith('create') ? () => ({ addColorStop: noop }) : noop),
        set: (o, k, v) => (o[k] = v, true),
      }),
    });
    return elements.get(id);
  }
  class Recognition {
    constructor() { recognizer = this; }
    start() { this.onstart(); }
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const synth = { speaking: false, cancel: noop, pause: noop, resume: noop,
    getVoices: () => [], addEventListener: noop, speak: u => utterances.push(u) };
  const body = { dataset: {} };
  const sandbox = { console, performance: { now: () => 0 }, location: { hostname: 'localhost' },
    navigator: { userAgent: 'Test browser' }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    document: { body, addEventListener: noop, getElementById: element, querySelectorAll: () => [],
      querySelector: selector => element(selector), createElement: () => element('entry') },
    window: { innerWidth: width, devicePixelRatio: 1, addEventListener: noop, setTimeout: noop,
      clearTimeout: noop, speechSynthesis: synth, ...(recognition ? { SpeechRecognition: Recognition } : {}) },
    requestAnimationFrame: noop };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), sandbox);
  return { debug: sandbox.window.__AI_DRIVE_DEBUG__, element, body, utterances, synth, recognizer };
}

test('both layouts complete exactly two crashes, park, and reset practice', () => {
  for (const width of [390, 1280]) {
    const { debug, body, element } = loadGame({ width });
    assert.equal(body.dataset.screen, 'home');
    debug.navigate('demo');
    for (let now = 10000; now <= 70000; now += 10000) debug.demoStep(now);
    const state = debug.snapshot();
    assert.equal(state.game.crashes, 2);
    assert.equal(state.game.finished, true);
    assert.equal(state.parking.inside, true);
    assert.equal(state.parking.aligned, true);
    debug.navigate('practice');
    assert.equal(debug.snapshot().game.crashes, 0);
    assert.equal(element('difficultySelect').value, '0.08');
    assert.equal(element('demoControls').hidden, true);
    assert.equal(debug.autopark().game.failed, false);
    assert.equal(debug.snapshot().game.finished, true);
  }
});

test('playback speed changes movement timing but keeps narration natural', () => {
  const { debug, element, utterances } = loadGame();
  debug.navigate('demo');
  element('demoSpeed').value = '0.75';
  debug.demoStep(2000);
  assert.equal(debug.snapshot().demo.sceneElapsed, 1.5);
  element('demoSpeed').value = '1.25';
  debug.demoStep(3000);
  assert.equal(debug.snapshot().demo.sceneElapsed, 2.75);
  assert.equal(utterances[0].rate, 1.02);
});

test('pause freezes scene and resume does not include paused wall time', () => {
  const { debug } = loadGame();
  debug.navigate('demo'); debug.demoStep(1000);
  const before = debug.snapshot().car.x;
  debug.pauseDemo(true); debug.demoStep(3000);
  assert.equal(debug.snapshot().car.x, before);
  assert.equal(debug.snapshot().demo.sceneElapsed, 1);
  debug.pauseDemo(false); debug.demoStep(4000);
  assert.equal(debug.snapshot().demo.sceneElapsed, 2);
});

test('narration can finish before changing chapter and replay starts fresh', () => {
  const { debug, synth } = loadGame();
  debug.navigate('demo'); synth.speaking = true; debug.demoStep(10000);
  assert.equal(debug.snapshot().demo.phase, 0);
  synth.speaking = false; debug.demoStep(11000);
  assert.equal(debug.snapshot().demo.phase, 1);
  debug.navigate('demo'); assert.equal(debug.snapshot().demo.phase, 0);
  assert.equal(debug.snapshot().game.crashes, 0);
});

test('hold-to-talk cancellation discards text and empty recording cannot send an old command', () => {
  const { debug, element, recognizer } = loadGame({ recognition: true });
  debug.navigate('practice'); element('difficultySelect').value = '0';
  const mic = element('micButton'); element('commandInput').value = '挂倒挡';
  mic.listeners.pointerdown(); mic.listeners.pointerup();
  assert.equal(debug.snapshot().game.started, false);
  mic.listeners.pointerdown();
  recognizer.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: '挂倒挡' }], { isFinal: true })] });
  mic.listeners.pointercancel();
  assert.equal(debug.snapshot().game.started, false);
  assert.equal(debug.snapshot().car.targetSpeed, 0);
});

test('wall approach hesitates, then accelerates sharply without crossing the wall', () => {
  const { debug } = loadGame();
  debug.navigate('demo'); debug.demoStep(5000);
  assert.equal(debug.snapshot().demo.phase, 1);
  const start = debug.snapshot().car.x;
  debug.demoStep(6000); assert.equal(debug.snapshot().car.x, start);
  debug.demoStep(7800); const x1 = debug.snapshot().car.x;
  debug.demoStep(8000); const x2 = debug.snapshot().car.x;
  debug.demoStep(8200); const x3 = debug.snapshot().car.x;
  assert.ok(x3 - x2 > x2 - x1, 'the late approach must accelerate');
  debug.demoStep(8800);
  const hit = debug.snapshot();
  assert.equal(hit.game.crashes, 1);
  assert.ok(Math.abs(hit.car.x + 46 - 1062) < .01);
  assert.equal(debug.overlapsDemoTarget('demo-wall'), false);
  assert.equal(hit.impact.x, 1062);
});

test('both crashes stop at first contact at every playback speed and coarse frames', () => {
  for (const speed of ['0.75', '1', '1.25']) {
    for (const frameMs of [16, 250, 1000]) {
      const { debug, element } = loadGame();
      debug.navigate('demo'); element('demoSpeed').value = speed;
      let checkedCrashes = 0;
      for (let now = frameMs; now <= 90000; now += frameMs) {
        debug.demoStep(now);
        const state = debug.snapshot();
        if (state.game.crashes > checkedCrashes) {
          checkedCrashes = state.game.crashes;
          const target = checkedCrashes === 1 ? 'demo-wall' : 'left-car';
          assert.equal(debug.overlapsDemoTarget(target), false, `${speed}x / ${frameMs}ms / ${target}`);
          assert.equal(state.impact.remaining, 1.7);
          if (checkedCrashes === 2) {
            assert.ok(state.impact.x >= 566 && state.impact.x <= 628);
            assert.ok(state.impact.y >= 78 && state.impact.y <= 244);
          }
        }
        if (state.game.finished) break;
      }
      assert.equal(checkedCrashes, 2);
      assert.equal(debug.snapshot().game.finished, true);
      assert.equal(debug.snapshot().parking.inside, true);
    }
  }
});
