const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Exercise game state with a minimal browser adapter; real device tests are separate.
function loadGame({ width = 390, recognition = false, fetch, parkingSpeech } = {}) {
  const noop = () => {};
  const elements = new Map();
  const utterances = [];
  const recognizers = [];
  const timers = new Map();
  const documentListeners = {};
  let now = 0;
  let nextTimer = 1;
  function setTimeout(action, delay = 0) {
    const id = nextTimer++;
    timers.set(id, { action, at: now + delay });
    return id;
  }
  function advanceTimers(milliseconds = 0) {
    const end = now + milliseconds;
    let count = 0;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(count++ < 1000, 'timers must not endlessly restart recognition');
      now = next[1].at;
      timers.delete(next[0]);
      next[1].action();
    }
    now = end;
  }
  function makeElement(id = '') {
    const children = [];
    const descendants = new Map();
    let html = '';
    return {
      value: id === 'difficultySelect' ? '0.08' : id === 'demoSpeed' ? '1' : '',
      hidden: false, textContent: '', listeners: {}, children,
      style: { setProperty: noop, removeProperty: noop },
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; children.length = 0; },
      classList: { add: noop, remove: noop }, setAttribute: noop,
      addEventListener(type, action) { this.listeners[type] = action; },
      querySelector(selector) {
        if (!descendants.has(selector)) descendants.set(selector, { textContent: '', remove: noop });
        return descendants.get(selector);
      },
      appendChild(child) { children.push(child); },
      setPointerCapture: noop, focus: noop,
      getContext: () => new Proxy({}, {
        get: (o, k) => o[k] || (k.startsWith('create') ? () => ({ addColorStop: noop }) : noop),
        set: (o, k, v) => (o[k] = v, true),
      }),
    };
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  }
  class Recognition {
    constructor() { recognizers.push(this); this.active = false; this.starts = 0; this.aborts = 0; }
    start() {
      if (this.active) throw new Error('Recognition is already active');
      this.active = true;
      this.starts += 1;
      const onstart = this.onstart;
      setTimeout(() => onstart?.(), 0);
    }
    stop() { this.end(); }
    abort() { this.aborts += 1; this.end(); }
    end() {
      this.active = false;
      const onend = this.onend;
      setTimeout(() => onend?.(), 0);
    }
    result(text, { final = false, index = 0, prior = [], confidence = 0.7, alternatives = [] } = {}) {
      const result = Object.assign([{ transcript: text, confidence }, ...alternatives.map(alternative => (
        typeof alternative === 'string' ? { transcript: alternative, confidence: 0.5 } : alternative
      ))], { isFinal: final });
      this.onresult?.({ resultIndex: index, results: [...prior, result] });
      return result;
    }
    error(error) { this.onerror?.({ error }); }
  }
  const synth = { speaking: false, cancel: noop, pause: noop, resume: noop,
    getVoices: () => [], addEventListener: noop, speak: u => utterances.push(u) };
  const body = { dataset: {} };
  const sandbox = { console, performance: { now: () => now }, location: { hostname: 'localhost' },
    AbortController, ...(fetch ? { fetch } : {}),
    navigator: { userAgent: 'Test browser' }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    document: { body, hidden: false, addEventListener: (type, action) => { documentListeners[type] = action; },
      getElementById: element, querySelectorAll: () => [],
      querySelector: selector => element(selector), createElement: () => makeElement() },
    window: { innerWidth: width, devicePixelRatio: 1, addEventListener: noop, setTimeout,
      clearTimeout: id => timers.delete(id), speechSynthesis: synth, ...(recognition ? { SpeechRecognition: Recognition } : {}),
      ...(parkingSpeech ? { ParkingSpeech: parkingSpeech } : {}) },
    requestAnimationFrame: noop };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), sandbox);
  return { debug: sandbox.window.__AI_DRIVE_DEBUG__, element, body, utterances, synth, recognizers,
    get recognizer() { return recognizers.at(-1); }, advanceTimers,
    document: sandbox.document, documentListeners,
    userLogs: () => element('commandLog').children.filter(entry => entry.className === 'log-entry user'),
  };
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

function startVoice(options = {}) {
  const game = loadGame({ ...options, recognition: true });
  game.debug.navigate('practice');
  game.element('difficultySelect').value = '0';
  game.element('micButton').listeners.click();
  game.advanceTimers();
  return game;
}

test('either head-first driving or tail-first reversing into the bay succeeds after a spoken stop', () => {
  for (const { angleDegrees, command, sign } of [
    { angleDegrees: 0, command: '前进', sign: 1 },
    { angleDegrees: 180, command: '倒车', sign: -1 },
  ]) {
    const { debug, recognizer } = startVoice();
    debug.setPracticePose({ x: 730, y: 360, angleDegrees });
    assert.equal(debug.snapshot().parking.inside, false, 'the car must start outside the bay');
    const moving = recognizer.result(command, { final: true });
    debug.advance(8, () => debug.snapshot().car.y <= 180);
    const entered = debug.snapshot();
    assert.ok(entered.car.y < 360, 'normal game physics must carry the car through the bay entrance');
    assert.ok(entered.car.speed * sign > 0, 'the intended gear must actually move the car');
    assert.ok(entered.game.elapsed > 3);
    assert.equal(entered.game.crashes, 0);
    assert.equal(entered.parking.inside, true);
    assert.equal(entered.parking.aligned, true);
    assert.equal(entered.game.finished, false, 'entering while moving must not complete the round');

    recognizer.result('停', { index: 1, prior: [moving] });
    assert.equal(debug.snapshot().car.speed, 0);
    debug.advance(0.1);
    const parked = debug.snapshot();
    assert.equal(parked.game.finished, true, `${command} into the bay must count`);
    assert.equal(parked.game.failed, false);
    assert.equal(parked.parking.inside, true);
    assert.equal(parked.parking.aligned, true);
  }
});

test('stopping with either end still outside the bay does not complete the round', () => {
  for (const { angleDegrees, command } of [
    { angleDegrees: 0, command: '前进' },
    { angleDegrees: 180, command: '倒车' },
  ]) {
    const { debug, recognizer } = startVoice();
    debug.setPracticePose({ x: 730, y: 360, angleDegrees });
    const moving = recognizer.result(command, { final: true });
    debug.advance(8, () => debug.snapshot().car.y <= 260);
    assert.ok(Math.abs(debug.snapshot().car.speed) > 0);
    assert.equal(debug.snapshot().parking.inside, false);
    recognizer.result('停', { index: 1, prior: [moving] });
    debug.advance(2);
    const partial = debug.snapshot();
    assert.ok(partial.game.elapsed > 3);
    assert.equal(partial.car.speed, 0);
    assert.equal(partial.parking.inside, false);
    assert.equal(partial.game.finished, false);
  }
});

test('a lateral near miss or a fully inside but crooked car cannot win by stopping', () => {
  for (const { pose, inside, aligned } of [
    { pose: { x: 699, y: 163, angleDegrees: 0 }, inside: false, aligned: true },
    { pose: { x: 730, y: 163, angleDegrees: 15 }, inside: true, aligned: false },
  ]) {
    const { debug, recognizer } = startVoice();
    debug.setPracticePose(pose);
    const moving = recognizer.result('前进', { final: true });
    debug.advance(0.25);
    assert.ok(debug.snapshot().car.speed > 0);
    recognizer.result('停', { index: 1, prior: [moving] });
    debug.advance(4);
    const missed = debug.snapshot();
    assert.ok(missed.game.elapsed > 3);
    assert.equal(missed.parking.inside, inside);
    assert.equal(missed.parking.aligned, aligned);
    assert.equal(missed.game.finished, false);
  }
});

test('single-character reverse and stop work on interim speech without release', () => {
  const { debug, recognizer } = startVoice();
  const reverse = recognizer.result('倒');
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  debug.advance(0.25);
  assert.ok(debug.snapshot().car.speed < 0);
  recognizer.result('停', { index: 1, prior: [reverse] });
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(debug.snapshot().car.speed, 0);
  assert.equal(debug.snapshot().voice.enabled, true);
  assert.equal(recognizer.active, true);
});

test('repeated short words do not replay actions, while a later short reverse resumes after stop', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('倒');
  recognizer.result('倒倒倒');
  recognizer.result('倒倒倒', { final: true });
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  assert.equal(userLogs().length, 1);
  recognizer.result('倒倒倒停停停');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(userLogs().length, 2);
  recognizer.result('倒倒倒停停停', { final: true });
  assert.equal(userLogs().length, 2);
  recognizer.result('倒倒倒停停停倒');
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  assert.equal(userLogs().length, 3);
});

test('negated reverse and ordinary mentions containing short words are not voice commands', () => {
  for (const text of ['不要倒', '别倒', '不用倒车', '倒霉', '倒计时', '停车场', '我在停车场', '暂停音乐']) {
    const { debug, recognizer, userLogs } = startVoice();
    recognizer.result(text, { final: true });
    assert.equal(debug.snapshot().car.targetSpeed, 0, text);
    assert.equal(debug.snapshot().game.commandCount, 0, text);
    assert.equal(userLogs().length, 0, text);
  }
  const { debug, recognizer } = startVoice();
  const reverse = recognizer.result('倒车', { final: true });
  for (const text of ['不要停', '别停车', '不停']) {
    recognizer.result(text, { final: true, index: 1, prior: [reverse] });
    assert.ok(debug.snapshot().car.targetSpeed < 0, text);
  }
});

test('interim voice immediately reverses without waiting for release or final recognition', () => {
  const { debug, recognizer, userLogs } = startVoice();
  assert.equal(recognizer.continuous, true);
  assert.equal(recognizer.interimResults, true);
  recognizer.result('倒车');
  assert.equal(debug.snapshot().game.started, true);
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  assert.equal(userLogs().length, 1);
});

test('one start hears reverse, stop, and forward continuously, with no release or new recording', () => {
  const game = startVoice();
  const recognizer = game.recognizer;
  const session = game.debug.snapshot().voice.session;
  const reverse = recognizer.result('倒车');
  game.debug.advance(0.5);
  assert.ok(game.debug.snapshot().car.speed < 0, 'the car must actually move before testing a spoken stop');

  game.element('micButton').listeners.pointerup?.({ preventDefault() {} });
  game.element('micButton').listeners.click();
  assert.equal(game.debug.snapshot().voice.enabled, true, 'release and another start must leave listening enabled');
  assert.equal(game.recognizer, recognizer);
  assert.equal(recognizer.starts, 1);
  assert.equal(recognizer.aborts, 0);

  const stop = recognizer.result('停', { index: 1, prior: [reverse] });
  const stopped = game.debug.snapshot();
  assert.equal(stopped.car.speed, 0, 'an interim stop must brake the actual car immediately');
  assert.equal(stopped.car.targetSpeed, 0);
  assert.equal(stopped.voice.enabled, true);
  assert.equal(stopped.voice.session, session);
  assert.equal(stopped.game.listening, true);
  assert.equal(recognizer.active, true);
  assert.equal(recognizer.aborts, 0);

  recognizer.result('前进', { index: 2, prior: [reverse, stop] });
  assert.ok(game.debug.snapshot().car.targetSpeed > 0);
  game.debug.advance(0.5);
  assert.ok(game.debug.snapshot().car.speed > 0);
  assert.equal(recognizer.starts, 1, 'all three commands must use the same active recording');

  game.element('endVoiceButton').listeners.click();
  assert.equal(game.debug.snapshot().voice.enabled, false);
  assert.equal(game.debug.snapshot().game.listening, false);
  assert.equal(game.debug.snapshot().car.speed, 0);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(recognizer.active, false);
  assert.equal(recognizer.aborts, 1);
});

test('interim refinements update steering and final duplicates do not add actions or logs', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('往左');
  assert.equal(debug.snapshot().car.targetSteeringDegrees, -14);
  recognizer.result('往左打死');
  assert.ok(debug.snapshot().car.targetSteeringDegrees < -14);
  const count = userLogs().length;
  recognizer.result('往左打死');
  recognizer.result('往左打死', { final: true });
  assert.equal(userLogs().length, count);
});

test('final steering revision restores an earlier left intent at the same speech offset', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('往左');
  assert.equal(debug.snapshot().car.targetSteeringDegrees, -14);
  recognizer.result('往右');
  assert.equal(debug.snapshot().car.targetSteeringDegrees, 14);
  recognizer.result('往左', { final: true });
  assert.equal(debug.snapshot().car.targetSteeringDegrees, -14);
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
  recognizer.result('往左', { final: true });
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
});

test('final gear revision restores reverse after an interim forward correction at the same offset', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('倒车');
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  recognizer.result('前进');
  assert.ok(debug.snapshot().car.targetSpeed > 0);
  recognizer.result('倒车', { final: true });
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
  recognizer.result('倒车', { final: true });
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
});

test('final revision restores urgent stop after an interim forward correction at the same offset', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('停车');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  recognizer.result('前进');
  assert.ok(debug.snapshot().car.targetSpeed > 0);
  recognizer.result('停车', { final: true });
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
  recognizer.result('停车', { final: true });
  assert.equal(debug.snapshot().game.commandCount, 3);
  assert.equal(userLogs().length, 3);
});

test('a cumulative stop phrase immediately brakes and final text cannot restart reverse', () => {
  const { debug, recognizer, userLogs, advanceTimers } = startVoice();
  recognizer.result('倒车');
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  recognizer.result('倒车倒车');
  assert.equal(userLogs().length, 1);
  recognizer.result('倒车倒车停车');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  const count = userLogs().length;
  recognizer.result('倒车倒车停车', { final: true });
  advanceTimers(3000);
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(userLogs().length, count);
});

test('fresh later reverse command can execute after a final stop in the same listening session', () => {
  const { debug, recognizer } = startVoice();
  const reverse = recognizer.result('倒车', { final: true });
  const stop = recognizer.result('停车', { final: true, index: 1, prior: [reverse] });
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  recognizer.result('倒车', { index: 2, prior: [reverse, stop] });
  assert.ok(debug.snapshot().car.targetSpeed < 0);
});

test('a fresh command suffix after a stop can resume within the same interim result', () => {
  const { debug, recognizer } = startVoice();
  recognizer.result('倒车停车');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  recognizer.result('倒车停车前进');
  assert.ok(debug.snapshot().car.targetSpeed > 0);
});

test('final punctuation, spacing, and leading filler do not replay an earlier stop', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('倒车停车');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  recognizer.result('倒车停车前进');
  assert.ok(debug.snapshot().car.targetSpeed > 0);
  const count = debug.snapshot().game.commandCount;
  const logs = userLogs().length;
  for (const text of ['倒车，停车，前进', '倒车  停车  前进', '嗯，倒车，停车，前进']) {
    recognizer.result(text, { final: true });
    assert.ok(debug.snapshot().car.targetSpeed > 0, text);
    assert.equal(debug.snapshot().game.commandCount, count, text);
    assert.equal(userLogs().length, logs, text);
  }
});

test('live listening keeps character subtitles but suppresses voice feedback to the microphone', () => {
  const { recognizer, utterances, element } = startVoice();
  const before = utterances.length;
  recognizer.result('倒车');
  recognizer.result('停车');
  assert.equal(utterances.length, before);
  assert.ok(element('speechBubble').textContent.length > 0);
});

test('AI learner replies stay in the game bubble even when practice audio is enabled', () => {
  const { debug, element, utterances } = loadGame();
  debug.navigate('practice');
  element('difficultySelect').value = '0';
  for (const command of ['倒车', '停车', '嗯我想想', '前进']) {
    element('commandInput').value = command;
    element('sendButton').listeners.click();
    assert.ok(element('speechBubble').textContent.length > 0);
  }
  assert.equal(utterances.length, 0, 'AI quips must never be spoken during practice');
});

test('demo speaks only coach narration and keeps the AI replies in a separate bubble', () => {
  const { debug, element, utterances } = loadGame();
  debug.navigate('demo');
  assert.ok(element('stageCoachText').textContent.length > 0);
  assert.ok(element('speechBubble').textContent.length > 0);
  assert.notEqual(element('stageCoachText').textContent, element('speechBubble').textContent);
  assert.equal(utterances[0].text, element('stageCoachText').textContent);

  const coachCaptions = new Set([element('stageCoachText').textContent]);
  const learnerCaptions = new Set([element('speechBubble').textContent]);
  for (let now = 200; now <= 90000 && !debug.snapshot().game.finished; now += 200) {
    debug.demoStep(now);
    coachCaptions.add(element('stageCoachText').textContent);
    learnerCaptions.add(element('speechBubble').textContent);
  }
  assert.equal(debug.snapshot().game.crashes, 2);
  assert.equal(debug.snapshot().game.finished, true);
  assert.ok(utterances.length > 1);
  for (const utterance of utterances) {
    assert.ok(coachCaptions.has(utterance.text), `spoken narration must have a coach caption: ${utterance.text}`);
    assert.equal(learnerCaptions.has(utterance.text), false, `AI reply must stay silent: ${utterance.text}`);
    assert.equal(utterance.rate, 1.02);
  }
});

test('unrecognized speech produces no movement or command spam and final text gives an inline hint', () => {
  const { debug, recognizer, userLogs, element } = startVoice();
  recognizer.result('嗯');
  recognizer.result('嗯我想想');
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(userLogs().length, 0);
  recognizer.result('嗯我想想', { final: true });
  assert.equal(userLogs().length, 0);
  const hint = element('voiceTranscript').textContent + element('speechBubble').textContent;
  assert.match(hint, /指令|倒车|停车/);
});

test('normal recognition end restarts listening, while the end button brakes and discards late events', () => {
  const game = startVoice();
  const first = game.recognizer;
  first.result('倒车');
  first.end();
  game.advanceTimers();
  assert.equal(game.debug.snapshot().car.targetSpeed, 0, 'restart gap must brake while the microphone cannot hear');
  game.advanceTimers(500);
  assert.ok(game.recognizers.reduce((sum, item) => sum + item.starts, 0) >= 2);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0, 'new session must wait for a fresh command');
  const active = game.recognizer;
  active.result('倒车');
  assert.ok(game.debug.snapshot().car.targetSpeed < 0);
  const staleResult = active.onresult;
  const staleEnd = active.onend;
  game.element('endVoiceButton').listeners.click();
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  const starts = game.recognizers.reduce((sum, item) => sum + item.starts, 0);
  staleResult({ resultIndex: 0, results: [Object.assign([{ transcript: '倒车' }], { isFinal: true })] });
  staleEnd();
  game.advanceTimers(1000);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.recognizers.reduce((sum, item) => sum + item.starts, 0), starts);
});

test('canceling pending recognition startup cannot leave listening or execute stale results', () => {
  const game = loadGame({ recognition: true });
  game.debug.navigate('practice');
  game.element('difficultySelect').value = '0';
  game.element('micButton').listeners.click();
  const first = game.recognizer;
  game.element('endVoiceButton').listeners.click();
  game.advanceTimers(1000);
  first.result('倒车', { final: true });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.debug.snapshot().game.listening, false);
  game.element('micButton').listeners.click();
  game.advanceTimers();
  first.result('前进', { final: true });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  game.recognizer.result('倒车');
  assert.ok(game.debug.snapshot().car.targetSpeed < 0);
});

test('recognition error brakes, shows a fallback, and cannot restart from a later end event', () => {
  const game = startVoice();
  game.recognizer.result('倒车');
  game.recognizer.error('network');
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.match(game.element('toast').textContent, /网络|文字/);
  const starts = game.recognizers.reduce((sum, item) => sum + item.starts, 0);
  game.recognizer.end();
  game.advanceTimers(1000);
  game.recognizer.result('前进', { final: true });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.recognizers.reduce((sum, item) => sum + item.starts, 0), starts);
});

test('navigation, reset, hidden page, and round finish discard old speech events', () => {
  for (const exit of ['navigation', 'reset', 'hidden', 'finish']) {
    const game = startVoice();
    const stale = game.recognizer;
    stale.result('倒车');
    if (exit === 'navigation') game.debug.navigate('home');
    if (exit === 'reset') game.element('resetButton').listeners.click();
    if (exit === 'hidden') {
      game.document.hidden = true;
      game.documentListeners.visibilitychange();
    }
    if (exit === 'finish') game.debug.autopark();
    const before = game.debug.snapshot().car.targetSpeed;
    assert.equal(before, 0, exit);
    stale.result('前进', { final: true });
    stale.end();
    game.advanceTimers(1000);
    assert.equal(game.debug.snapshot().car.targetSpeed, 0, exit);
    assert.equal(game.debug.snapshot().game.listening, false, exit);
  }
});

test('real-time stop invalidates an already pending enhanced text command', async () => {
  let resolveRequest;
  const game = startVoice({ fetch: () => new Promise(resolve => { resolveRequest = resolve; }) });
  game.element('enhancedToggle').checked = true;
  game.element('commandInput').value = '请把车向后开';
  game.element('sendButton').listeners.click();
  assert.equal(typeof resolveRequest, 'function');
  game.recognizer.result('停车');
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  resolveRequest({ ok: true, json: async () => ({ understood: true, gear: 'R', move: true, summary: ['倒车'] }) });
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  game.advanceTimers(3000);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
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

async function flushPromises() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function localVoiceFixture({ pending = false } = {}) {
  const sessions = [];
  const engine = {
    isSupported: () => true,
    start(options) {
      const handle = { stops: 0, stop() { this.stops += 1; } };
      const session = { options, handle, resolve: null };
      sessions.push(session);
      if (pending) return new Promise(resolve => { session.resolve = () => resolve(handle); });
      return Promise.resolve(handle);
    },
  };
  const game = loadGame({ recognition: true, parkingSpeech: engine });
  game.debug.navigate('practice');
  game.element('difficultySelect').value = '0';
  game.element('voiceEngine').value = 'local';
  game.element('micButton').listeners.click();
  return { game, sessions };
}

test('the local speech engine executes short and spaced Chinese commands in one open session', async () => {
  const { game, sessions } = localVoiceFixture();
  await flushPromises();
  assert.equal(sessions.length, 1);
  assert.equal(game.recognizers.length, 0, 'selecting local recognition must not start browser recognition');
  const { options, handle } = sessions[0];
  assert.equal(game.debug.snapshot().voice.enabled, true);
  assert.equal(game.debug.snapshot().game.listening, true);
  assert.equal(options.signal.aborted, false);
  options.onText('倒', { final: false, id: 0, confidence: 0.92 });
  game.debug.advance(0.25);
  assert.ok(game.debug.snapshot().car.speed < 0);
  options.onText('停', { final: false, id: 1, confidence: 0.95 });
  assert.equal(game.debug.snapshot().car.speed, 0);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  options.onText('前 进', { final: false, id: 2, confidence: 0.9 });
  assert.ok(game.debug.snapshot().car.targetSpeed > 0);
  game.debug.advance(0.25);
  assert.ok(game.debug.snapshot().car.speed > 0);
  assert.equal(sessions.length, 1);
  assert.equal(handle.stops, 0);
  assert.equal(game.debug.snapshot().voice.enabled, true);

  game.element('endVoiceButton').listeners.click();
  assert.equal(options.signal.aborted, true);
  assert.equal(handle.stops, 1);
  assert.equal(game.debug.snapshot().car.speed, 0);
  assert.equal(game.debug.snapshot().voice.enabled, false);
  options.onText('倒', { final: true, id: 3, confidence: 0.96 });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0, 'late local text after End must not move the car');
});

test('ending local voice while its model is loading aborts readiness and disposes a late handle', async () => {
  const { game, sessions } = localVoiceFixture({ pending: true });
  assert.equal(sessions.length, 1);
  const { options, handle, resolve } = sessions[0];
  assert.equal(options.signal.aborted, false);
  game.element('endVoiceButton').listeners.click();
  assert.equal(options.signal.aborted, true);
  options.onText('倒', { final: true, id: 0, confidence: 0.98 });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  resolve();
  await flushPromises();
  assert.equal(handle.stops, 1, 'a model that resolves after cancellation must release its microphone');
  assert.equal(game.debug.snapshot().voice.enabled, false);
  assert.equal(game.debug.snapshot().game.listening, false);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.recognizers.length, 0);
});

test('a local speech error brakes and offers browser fallback without switching microphone services', async () => {
  const { game, sessions } = localVoiceFixture();
  await flushPromises();
  const { options } = sessions[0];
  options.onText('倒', { final: false, id: 0, confidence: 0.9 });
  game.debug.advance(0.25);
  assert.ok(game.debug.snapshot().car.speed < 0);
  options.onError(new Error('Local recognizer could not continue'));
  assert.equal(game.debug.snapshot().car.speed, 0);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.debug.snapshot().voice.enabled, false);
  assert.equal(options.signal.aborted, true);
  assert.equal(game.element('voiceEngine').value, 'local');
  assert.equal(game.recognizers.length, 0, 'an error must not silently switch to another microphone service');
  const hint = game.element('voiceTranscript').textContent + game.element('toast').textContent;
  assert.match(hint, /浏览器|文字|快捷指令/);
  options.onText('前进', { final: true, id: 1, confidence: 0.99 });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
});

test('navigation, reset, hidden page, and round finish also cancel the local microphone session', async () => {
  for (const exit of ['navigation', 'reset', 'hidden', 'finish']) {
    const { game, sessions } = localVoiceFixture();
    await flushPromises();
    const { options, handle } = sessions[0];
    options.onText('倒', { final: true, id: 0, confidence: 0.9 });
    if (exit === 'navigation') game.debug.navigate('home');
    if (exit === 'reset') game.element('resetButton').listeners.click();
    if (exit === 'hidden') {
      game.document.hidden = true;
      game.documentListeners.visibilitychange();
    }
    if (exit === 'finish') game.debug.autopark();
    assert.equal(options.signal.aborted, true, exit);
    assert.equal(handle.stops, 1, exit);
    assert.equal(game.debug.snapshot().car.targetSpeed, 0, exit);
    assert.equal(game.debug.snapshot().voice.enabled, false, exit);
    options.onText('前进', { final: true, id: 1, confidence: 0.98 });
    assert.equal(game.debug.snapshot().car.targetSpeed, 0, `${exit} must ignore late local recognition`);
  }
});

test('browser recognition can recover an understood command from alternative hypotheses without replaying it', () => {
  const { debug, recognizer, userLogs } = startVoice();
  assert.ok(recognizer.maxAlternatives > 1);
  const reverse = recognizer.result('道', { alternatives: ['倒'] });
  assert.ok(debug.snapshot().car.targetSpeed < 0);
  assert.equal(userLogs().length, 1);
  recognizer.result('道', { alternatives: ['倒'], final: true });
  assert.equal(userLogs().length, 1, 'repeated alternative command must not be replayed');
  debug.advance(0.25);
  assert.ok(debug.snapshot().car.speed < 0);
  recognizer.result('挺', { index: 1, prior: [reverse], alternatives: ['停'] });
  assert.equal(debug.snapshot().car.speed, 0);
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(userLogs().length, 2);
});

test('alternative hypotheses cannot override an explicit negation in the primary transcript', () => {
  const { debug, recognizer, userLogs } = startVoice();
  recognizer.result('不要倒', { final: true, alternatives: ['倒'] });
  assert.equal(debug.snapshot().car.targetSpeed, 0);
  assert.equal(debug.snapshot().game.commandCount, 0);
  assert.equal(userLogs().length, 0);
});

test('an unknown-word token in local speech cannot be promoted to a short driving command', async () => {
  const { game, sessions } = localVoiceFixture();
  await flushPromises();
  sessions[0].options.onText('[unk]倒', { final: true, id: 0, confidence: 0.9 });
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.debug.snapshot().game.commandCount, 0);
  assert.equal(game.userLogs().length, 0);
});


test('unknown filler does not swallow a clear stop, while a negated stop is still ignored', async () => {
  const { game, sessions } = localVoiceFixture();
  await flushPromises();
  const { options } = sessions[0];
  options.onText('倒', { final: false, id: 0 });
  game.debug.advance(0.25);
  assert.ok(game.debug.snapshot().car.speed < 0);
  options.onText('不要 停 [unk]', { final: false, id: 1 });
  assert.ok(game.debug.snapshot().car.targetSpeed < 0);
  options.onText('停 [unk]', { final: false, id: 2 });
  assert.equal(game.debug.snapshot().car.speed, 0);
  assert.equal(game.debug.snapshot().car.targetSpeed, 0);
  assert.equal(game.debug.snapshot().voice.enabled, true);
});
