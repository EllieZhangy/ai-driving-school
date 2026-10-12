(() => {
  "use strict";

  const WORLD = { width: 1100, height: 700 };
  const CAR_SPEC = {
    length: 92,
    width: 46,
    wheelBase: 58,
    maxSteer: toRad(32),
    steerRate: toRad(95),
    acceleration: 38,
    braking: 120,
  };

  const TARGET = { x: 675, y: 38, width: 110, height: 250 };
  const START = { x: 820, y: 470, angle: Math.PI / 2 };

  const dom = {
    canvas: document.getElementById("gameCanvas"),
    canvasWrap: document.getElementById("canvasWrap"),
    scoreValue: document.getElementById("scoreValue"),
    timeValue: document.getElementById("timeValue"),
    crashValue: document.getElementById("crashValue"),
    gearValue: document.getElementById("gearValue"),
    moodValue: document.getElementById("moodValue"),
    difficultySelect: document.getElementById("difficultySelect"),
    speechBubble: document.getElementById("speechBubble"),
    avatar: document.getElementById("avatar"),
    listeningBadge: document.getElementById("listeningBadge"),
    micButton: document.getElementById("micButton"),
    micHint: document.getElementById("micHint"),
    commandInput: document.getElementById("commandInput"),
    sendButton: document.getElementById("sendButton"),
    commandLog: document.getElementById("commandLog"),
    clearLogButton: document.getElementById("clearLogButton"),
    commandChips: document.getElementById("commandChips"),
    soundButton: document.getElementById("soundButton"),
    resetButton: document.getElementById("resetButton"),
    demoButton: document.getElementById("demoButton"),
    helpButton: document.getElementById("helpButton"),
    helpModal: document.getElementById("helpModal"),
    resultModal: document.getElementById("resultModal"),
    toast: document.getElementById("toast"),
    enhancedToggle: document.getElementById("enhancedToggle"),
    finalScore: document.getElementById("finalScore"),
    finalTime: document.getElementById("finalTime"),
    finalCrashes: document.getElementById("finalCrashes"),
    finalUnclear: document.getElementById("finalUnclear"),
    resultTitle: document.getElementById("resultTitle"),
    resultEmoji: document.getElementById("resultEmoji"),
    resultComment: document.getElementById("resultComment"),
    copyResultButton: document.getElementById("copyResultButton"),
    playAgainButton: document.getElementById("playAgainButton"),
  };

  const ctx = dom.canvas.getContext("2d", { alpha: false });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const obstacles = [
    { id: "left-car", type: "car", x: 597, y: 161, width: 62, length: 166, angle: 0, color: "#a5cfd7", label: "左侧车辆" },
    { id: "right-car", type: "car", x: 863, y: 161, width: 62, length: 166, angle: 0, color: "#dab0d0", label: "右侧车辆" },
    { id: "island-left", type: "rect", x: 28, y: 24, width: 465, height: 22, angle: 0, color: "#d6d0bf", label: "路沿" },
    { id: "island-right", type: "rect", x: 951, y: 24, width: 121, height: 22, angle: 0, color: "#d6d0bf", label: "路沿" },
  ];

  const cones = [
    { id: "target-left", x: TARGET.x, y: TARGET.y + TARGET.height + 13, radius: 10, label: "左侧标杆" },
    { id: "target-right", x: TARGET.x + TARGET.width, y: TARGET.y + TARGET.height + 13, radius: 10, label: "右侧标杆" },
    { id: "lane-left", x: 455, y: 365, radius: 10, label: "训练场路锥" },
    { id: "lane-right", x: 995, y: 365, radius: 10, label: "训练场路锥" },
  ];

  const noisePoints = Array.from({ length: 420 }, (_, i) => ({
    x: pseudoRandom(i * 17 + 3) * WORLD.width,
    y: pseudoRandom(i * 31 + 11) * WORLD.height,
    a: 0.018 + pseudoRandom(i * 47 + 5) * 0.025,
    r: 0.4 + pseudoRandom(i * 59 + 9) * 1.3,
  }));

  const car = {
    x: START.x,
    y: START.y,
    angle: START.angle,
    speed: 0,
    targetSpeed: 0,
    steer: 0,
    targetSteer: 0,
    gear: 0,
  };

  const game = {
    roundId: 1,
    started: false,
    startTime: 0,
    elapsed: 0,
    crashes: 0,
    unclear: 0,
    commandCount: 0,
    controlVersion: 0,
    finished: false,
    failed: false,
    muted: false,
    listening: false,
    score: 100,
    finalScore: null,
    lastCrashAt: -Infinity,
    lastFrameAt: performance.now(),
    showParkingHint: false,
    parkingHintShown: false,
    enhancedUnavailableShown: false,
    demo: false,
    demoPhase: 0,
    demoStartedAt: 0,
    demoCommandLock: false,
    beforeDemoDifficulty: "0.08",
  };

  const visual = {
    shake: 0,
    toastTimer: null,
    particles: [],
    confetti: [],
    skidMarks: [],
    trailClock: 0,
    targetPulse: 0,
    impact: 0,
    impactX: 0,
    impactY: 0,
    demoRush: 0,
  };

  let speechRecognition = null;
  const voice = { enabled: false, pending: false, session: 0, restartTimer: null, rapidEnds: 0, lastFingerprint: "" };
  let availableVoices = [];

  function toRad(degrees) {
    return degrees * Math.PI / 180;
  }

  function toDeg(radians) {
    return radians * 180 / Math.PI;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function approach(value, target, maxDelta) {
    if (value < target) return Math.min(value + maxDelta, target);
    if (value > target) return Math.max(value - maxDelta, target);
    return target;
  }

  function normalizeAngle(angle) {
    let normalized = angle % (Math.PI * 2);
    if (normalized < 0) normalized += Math.PI * 2;
    return normalized;
  }

  function angleDifference(a, b) {
    const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(diff, Math.PI * 2 - diff);
  }

  function pseudoRandom(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60).toString().padStart(2, "0");
    const secs = (total % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  }

  let renderWidth = WORLD.width;
  let renderHeight = WORLD.height;
  function setupCanvas() {
    const mobile = window.innerWidth <= 760;
    renderWidth = mobile ? 720 : WORLD.width;
    renderHeight = mobile ? 840 : WORLD.height;
    dom.canvas.width = Math.round(renderWidth * dpr);
    dom.canvas.height = Math.round(renderHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function resetGame({ keepModal = false, silent = false } = {}) {
    stopLiveVoice();
    game.roundId += 1;
    game.controlVersion += 1;
    game.started = false;
    game.startTime = 0;
    game.elapsed = 0;
    game.crashes = 0;
    game.unclear = 0;
    game.commandCount = 0;
    game.finished = false;
    game.failed = false;
    game.score = 100;
    game.finalScore = null;
    game.lastCrashAt = -Infinity;
    game.showParkingHint = false;
    game.parkingHintShown = false;
    game.demo = false;
    game.demoPhase = 0;
    game.demoStartedAt = 0;
    game.demoCommandLock = false;

    car.x = START.x;
    car.y = START.y;
    car.angle = START.angle;
    car.speed = 0;
    car.targetSpeed = 0;
    car.steer = 0;
    car.targetSteer = 0;
    car.gear = 0;

    visual.shake = 0;
    visual.impact = 0;
    visual.demoRush = 0;
    document.getElementById("comicCaption").classList.remove("visible");
    visual.particles = [];
    visual.confetti = [];
    visual.skidMarks = [];
    visual.trailClock = 0;

    dom.demoButton.textContent = "▶ 自动演示一遍";
    dom.demoButton.classList.remove("active");
    setBadge("等你发话");
    setAvatarMood("neutral");
    updateHud();
    if (!keepModal) closeModal(dom.resultModal);
    if (!silent) {
      setSisterSpeech("教练，我今天一定能一把过。大概吧。", "neutral", { logIt: false });
    }
  }

  function startRoundIfNeeded() {
    if (!game.started) {
      game.started = true;
      game.startTime = performance.now();
    }
  }

  function currentScore() {
    if (game.finalScore !== null) return game.finalScore;
    const timePenalty = Math.floor(game.elapsed * 0.11);
    const crashPenalty = game.crashes * 14;
    const unclearPenalty = game.unclear * 3;
    return clamp(100 - timePenalty - crashPenalty - unclearPenalty, 0, 100);
  }

  function updateHud() {
    game.score = currentScore();
    dom.scoreValue.textContent = game.score.toString();
    dom.timeValue.textContent = formatTime(game.elapsed);
    dom.crashValue.textContent = game.crashes.toString();
    dom.gearValue.textContent = car.gear === -1 ? "R" : car.gear === 1 ? "D" : "P";

    let mood = "还算冷静";
    if (game.crashes === 1) mood = "开始嘴硬";
    if (game.crashes === 2) mood = "有点慌了";
    if (game.crashes === 3) mood = "灵魂出窍";
    if (game.crashes >= 4) mood = "准备退学";
    dom.moodValue.textContent = mood;
  }

  function setBadge(text, state = "") {
    dom.listeningBadge.textContent = text;
    dom.listeningBadge.className = `status-badge${state ? ` ${state}` : ""}`;
  }

  function setAvatarMood(mood) {
    dom.avatar.classList.remove("annoyed", "panicked", "happy");
    if (mood && mood !== "neutral") dom.avatar.classList.add(mood);
  }

  function animateAvatar(kind = "reacting") {
    dom.avatar.classList.remove("reacting", "crashed");
    void dom.avatar.offsetWidth;
    dom.avatar.classList.add(kind);
    window.setTimeout(() => dom.avatar.classList.remove(kind), 480);
  }

  function setSisterSpeech(text, emotion = "neutral", { logIt = true } = {}) {
    dom.speechBubble.textContent = text;
    setAvatarMood(emotion);
    animateAvatar(emotion === "panicked" ? "crashed" : "reacting");
    if (logIt) addLog("student", "小满", text);
    animateStageDialogue("stageAIBubble", emotion);
  }

  function animateStageDialogue(id, mood = "neutral") {
    const bubble = document.getElementById(id);
    if (!bubble) return;
    bubble.classList.remove("speaking", "panicked", "happy", "annoyed");
    if (mood !== "neutral") bubble.classList.add(mood);
    void bubble.offsetWidth;
    bubble.classList.add("speaking");
  }

  function setCoachSpeech(text) {
    const subtitle = document.getElementById("stageCoachText");
    if (subtitle) subtitle.textContent = text;
    animateStageDialogue("stageCoachBubble");
    addLog("coach", "指挥者", text);
    speak(text);
  }

  function speak(text) {
    if (game.muted || voice.enabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    const preferred = availableVoices.find((voice) => /^zh-CN/i.test(voice.lang))
      || availableVoices.find((voice) => /^zh/i.test(voice.lang));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }

  function addLog(type, speaker, text, meta = "") {
    const empty = dom.commandLog.querySelector(".log-empty");
    if (empty) empty.remove();

    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    const avatarText = type === "user" ? "你" : type === "coach" ? "教" : "AI";
    entry.innerHTML = `
      <div class="log-avatar">${avatarText}</div>
      <div class="log-content">
        <strong>${escapeHtml(speaker)}</strong>
        <p>${escapeHtml(text)}</p>
        ${meta ? `<span class="log-meta">${escapeHtml(meta)}</span>` : ""}
      </div>
    `;
    dom.commandLog.appendChild(entry);
    dom.commandLog.scrollTop = dom.commandLog.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clearLog() {
    dom.commandLog.innerHTML = '<div class="log-empty">第一条指令会出现在这里。</div>';
  }

  function showToast(message, tone = "", duration = 1800) {
    if (visual.toastTimer) window.clearTimeout(visual.toastTimer);
    dom.toast.textContent = message;
    dom.toast.className = `stage-toast visible${tone ? ` ${tone}` : ""}`;
    visual.toastTimer = window.setTimeout(() => {
      dom.toast.className = "stage-toast";
    }, duration);
  }

  function openModal(modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function parseLocalCommand(rawText) {
    const text = rawText
      .toLowerCase()
      .replace(/[，。！？、,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const result = {
      understood: false,
      stop: false,
      gear: null,
      steering: null,
      speed: null,
      move: false,
      summary: [],
      source: "local",
      reply: "",
      misheard: false,
      misheardDetail: "",
    };

    if (!text) return result;

    const stopText = text.replace(/不要(?:停车|停|刹车)|不用(?:停车|停|刹车)|别(?:停车|停|踩刹车|刹车)|不踩刹车|不停|停车场/g, " ");
    const stopMatch = /(停下|停车|刹车|别动|不要动|停住|踩刹车|立刻停|马上停|停)/.test(stopText);
    const parkMatch = /(挂p挡|挂p档|p挡|p档|驻车)/.test(text);
    const reverseMatch = /(挂倒挡|挂倒档|倒挡|倒档|倒车|往后倒|向后倒|后退|往后退|退一点|退后)/.test(text);
    const driveMatch = /(挂d挡|挂d档|d挡|d档|前进|往前开|向前开|往前走|往前一点|开过去|向前一点)/.test(text);
    const continueMatch = /(继续|接着|别停|不要停|不停|保持|就这样|再来一点|再倒一点|再走一点)/.test(text);

    if (stopMatch) {
      result.stop = true;
      result.move = false;
      result.summary.push("停车");
    }

    if (parkMatch) {
      result.gear = "P";
      result.stop = true;
      result.summary.push("挂P挡");
    } else if (reverseMatch) {
      result.gear = "R";
      result.move = true;
      result.summary.push("挂倒挡");
    } else if (driveMatch) {
      result.gear = "D";
      result.move = true;
      result.summary.push("挂前进挡");
    }

    const steeringEvents = [];
    collectMatches(text, /(回正|打正|摆正|方向盘正|轮子回正|正回来|回一点)/g, () => ({ steering: "center", summary: "方向回正" }), steeringEvents);
    collectMatches(text, /(左(?:边)?(?:打|转|拐)?死|向左打死|往左打死|方向盘.{0,5}左.{0,3}死|左满舵|左边到底)/g, () => ({ steering: "left_full", summary: "左打死" }), steeringEvents);
    collectMatches(text, /(右(?:边)?(?:打|转|拐)?死|向右打死|往右打死|方向盘.{0,5}右.{0,3}死|右满舵|右边到底)/g, () => ({ steering: "right_full", summary: "右打死" }), steeringEvents);
    collectMatches(text, /(向左一点|往左一点|左打一(?:点|小圈|半圈)|左边一点|微微左|稍微左|左转一点|左一点)/g, () => ({ steering: "left_slight", summary: "向左一点" }), steeringEvents);
    collectMatches(text, /(向右一点|往右一点|右打一(?:点|小圈|半圈)|右边一点|微微右|稍微右|右转一点|右一点)/g, () => ({ steering: "right_slight", summary: "向右一点" }), steeringEvents);

    if (steeringEvents.length) {
      steeringEvents.sort((a, b) => a.index - b.index);
      const latest = steeringEvents[steeringEvents.length - 1];
      result.steering = latest.steering;
      result.summary.push(latest.summary);
    } else if (/(向左|往左|左转|打左)/.test(text)) {
      result.steering = "left_slight";
      result.summary.push("向左一点");
    } else if (/(向右|往右|右转|打右)/.test(text)) {
      result.steering = "right_slight";
      result.summary.push("向右一点");
    }

    if (/(慢慢|慢一点|慢点|缓缓|轻一点|别太快|龟速|稳一点|悠着点)/.test(text)) {
      result.speed = "slow";
      result.summary.push("慢速");
    } else if (/(快一点|快点|加速|踩油门|油门|冲|速度快)/.test(text)) {
      result.speed = "fast";
      result.summary.push("加速");
    } else if (/(正常速度|匀速|保持速度)/.test(text)) {
      result.speed = "normal";
      result.summary.push("正常速度");
    }

    if (continueMatch && !result.stop) {
      result.move = true;
      if (!result.summary.includes("继续行驶")) result.summary.push("继续行驶");
    }

    result.understood = Boolean(result.stop || result.gear || result.steering || result.speed || continueMatch);
    return result;
  }

  function collectMatches(text, regex, mapper, target) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      target.push({ index: match.index, ...mapper(match) });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }

  async function parseEnhancedCommand(text) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2200);
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          state: {
            gear: car.gear === -1 ? "R" : car.gear === 1 ? "D" : "P",
            steeringDegrees: Math.round(toDeg(car.targetSteer)),
            moving: Math.abs(car.targetSpeed) > 1,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return normalizeEnhancedResult(data);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalizeEnhancedResult(data) {
    const allowedSteering = new Set(["left_full", "left_slight", "center", "right_slight", "right_full", null]);
    const allowedSpeed = new Set(["slow", "normal", "fast", null]);
    const allowedGear = new Set(["R", "D", "P", null]);
    const result = {
      understood: Boolean(data?.understood),
      stop: Boolean(data?.stop),
      gear: allowedGear.has(data?.gear ?? null) ? (data?.gear ?? null) : null,
      steering: allowedSteering.has(data?.steering ?? null) ? (data?.steering ?? null) : null,
      speed: allowedSpeed.has(data?.speed ?? null) ? (data?.speed ?? null) : null,
      move: Boolean(data?.move),
      summary: Array.isArray(data?.summary) ? data.summary.slice(0, 5).map(String) : [],
      source: "llm",
      reply: typeof data?.reply === "string" ? data.reply.slice(0, 80) : "",
      misheard: false,
      misheardDetail: "",
    };
    if (result.stop) result.move = false;
    return result;
  }

  function applyMishearing(parsed, rawText, { ignoreMishear = false } = {}) {
    const chance = Number(dom.difficultySelect.value || 0);
    if (ignoreMishear || chance <= 0 || parsed.stop || Math.random() >= chance) return parsed;

    const changed = { ...parsed, summary: [...parsed.summary], misheard: true };
    const options = [];
    if (["left_full", "left_slight", "right_full", "right_slight"].includes(parsed.steering)) options.push("invert_steering");
    if (parsed.speed) options.push("speed");
    if (parsed.gear === "R" || parsed.gear === "D") options.push("gear");
    options.push("ignore");

    const mistake = pick(options);
    if (mistake === "invert_steering") {
      const map = {
        left_full: "right_full",
        left_slight: "right_slight",
        right_full: "left_full",
        right_slight: "left_slight",
      };
      const old = parsed.steering;
      changed.steering = map[old];
      changed.summary = changed.summary.map((item) => item
        .replace("左打死", "右打死")
        .replace("右打死", "左打死")
        .replace("向左一点", "向右一点")
        .replace("向右一点", "向左一点"));
      changed.misheardDetail = /left/.test(old) ? "把“左”听成了“右”" : "把“右”听成了“左”";
    } else if (mistake === "speed") {
      changed.speed = parsed.speed === "fast" ? "slow" : "fast";
      changed.misheardDetail = parsed.speed === "fast" ? "把“快一点”理解成了“慢一点”" : "把“慢一点”理解成了“快一点”";
    } else if (mistake === "gear") {
      changed.gear = parsed.gear === "R" ? "D" : "R";
      changed.move = true;
      changed.misheardDetail = parsed.gear === "R" ? "误挂成了前进挡" : "误挂成了倒挡";
    } else {
      changed.understood = false;
      changed.stop = false;
      changed.gear = null;
      changed.steering = null;
      changed.speed = null;
      changed.move = false;
      changed.summary = [];
      changed.misheardDetail = `只听见了“${rawText.slice(0, 8)}……”`;
    }
    return changed;
  }

  function instructionReply(parsed) {
    if (!parsed.understood) {
      if (parsed.misheard) return pick([
        "等一下，我刚才只听见一团空气。你再说一次。",
        "你说太快了，我的CPU刚刚打了个结。",
        "收到……不对，我什么都没收到。",
      ]);
      return pick([
        "你说的是驾驶指令吗？要不加上“左、右、倒、停”这些关键词？",
        "我听懂了每一个字，但组合起来完全没懂。",
        "再具体一点：挡位、方向、速度，至少告诉我一个。",
      ]);
    }

    if (parsed.misheard) {
      if (parsed.steering === "right_full") return "好，右打死！你刚才明明说的是右吧？";
      if (parsed.steering === "left_full") return "左打死收到。你不要突然说我听反了。";
      if (parsed.gear === "D") return "前进挡挂好了——等下，你是不是说的倒挡？";
      if (parsed.gear === "R") return "倒挡！我这次肯定没听错……应该。";
      return "收到，我按我理解的来。出了事别怪我。";
    }

    if (parsed.stop || parsed.gear === "P") {
      return pick([
        "刹——住了！你早半秒说不行吗？",
        "停好了。我的心也顺便停了一下。",
        "踩住刹车了，暂时谁都不用写事故报告。",
      ]);
    }

    if (parsed.gear === "R" && parsed.steering === "left_full") {
      return pick([
        "倒挡、左打死、慢慢倒。你最好真的会教。",
        "左打死开始倒！是方向盘打死，不是我打死，对吧？",
        "行，我往后倒。你盯紧点，我不想和标杆交朋友。",
      ]);
    }

    if (parsed.gear === "R" && parsed.steering === "right_full") {
      return "倒挡加右打死。你确定这不是在教我漂移？";
    }

    if (parsed.steering === "center") {
      return pick([
        "方向回正了。接下来你最好别沉默。",
        "回正，继续。现在车位看起来像个车位了。",
        "轮子正了。你看后面，我只负责紧张。",
      ]);
    }

    if (parsed.steering === "left_full") return "左打死！方向盘快被我拧下来了。";
    if (parsed.steering === "right_full") return "右打死！再右就要拧到副驾驶来了。";
    if (parsed.steering === "left_slight") return "往左一点。这个“一点”到底是多少点？";
    if (parsed.steering === "right_slight") return "往右一点。你们教练都爱说“一点”吗？";
    if (parsed.speed === "fast") return "加速？科目二也要赶高铁吗？";
    if (parsed.speed === "slow") return "好，慢慢来。慢到蚂蚁都能超车。";
    if (parsed.gear === "R") return "倒挡挂上了。我开始倒，你别走神。";
    if (parsed.gear === "D") return "前进挡。终于不是一直往后逃了。";
    if (parsed.move) return "继续走。你不喊停我可真不停。";
    return "收到。";
  }

  function instructionMeta(parsed) {
    const source = parsed.source === "llm" ? "大模型解析" : "本地解析";
    const summary = parsed.summary.length ? parsed.summary.join(" · ") : "未识别出可执行动作";
    const misheard = parsed.misheardDetail ? ` · 误听：${parsed.misheardDetail}` : "";
    return `${source}：${summary}${misheard}`;
  }

  async function submitCommand(rawText, options = {}) {
    const text = String(rawText || "").trim();
    if (!text || game.finished || document.body.dataset.screen !== "practice") return;

    if (game.demo && !options.fromDemo) stopDemo(false);

    game.commandCount += 1;
    addLog("user", options.fromDemo ? "导演指令" : "你", text);
    setBadge("正在理解", "thinking");
    dom.commandInput.value = "";

    const commandRound = game.roundId;
    const commandVersion = ++game.controlVersion;
    const local = options.parsed || parseLocalCommand(text);
    let parsed;
    if (local.stop) {
      parsed = local;
    } else if (dom.enhancedToggle.checked && !options.forceLocal) {
      try {
        parsed = await parseEnhancedCommand(text);
      } catch (error) {
        parsed = parseLocalCommand(text);
        if (!game.enhancedUnavailableShown) {
          game.enhancedUnavailableShown = true;
          showToast("未连接大模型服务，已自动使用本地理解", "", 2600);
          addLog("system", "系统", "大模型增强不可用，本条指令已回退到本地解析。", "运行 node server.mjs 并配置环境变量即可启用");
        }
      }
    } else {
      parsed = local;
    }

    if (commandRound !== game.roundId || commandVersion !== game.controlVersion || game.finished) return;
    parsed = applyMishearing(parsed, text, { ignoreMishear: Boolean(options.ignoreMishear || local.stop) });

    const reply = parsed.reply || instructionReply(parsed);
    const delay = options.immediate || parsed.stop ? 0 : 330 + Math.random() * 370;

    if (!parsed.understood) {
      game.unclear += 1;
      setBadge("没听明白");
      setSisterSpeech(reply, "annoyed");
      addLog("system", "指令解释", "没有执行车辆动作。", instructionMeta(parsed));
      showToast("没有识别出动作，可以说：挂倒挡 / 左打死 / 回正 / 停车");
      return;
    }

    setSisterSpeech(reply, game.crashes >= 2 ? "panicked" : "neutral");
    addLog("system", "指令解释", parsed.summary.join(" · ") || "执行上下文动作", instructionMeta(parsed));

    const execute = () => {
      if (commandRound !== game.roundId || commandVersion !== game.controlVersion || game.finished) return;
      applyInstruction(parsed);
      setBadge(voice.enabled ? "实时听你指挥" : "已执行", voice.enabled ? "listening" : "");
    };
    if (delay === 0) execute();
    else window.setTimeout(execute, delay);
  }

  function applyInstruction(parsed) {
    if (parsed.gear === "P") {
      car.gear = 0;
      car.targetSpeed = 0;
      car.speed = 0;
      car.targetSteer = 0;
      return;
    }

    if (parsed.gear === "R") car.gear = -1;
    if (parsed.gear === "D") car.gear = 1;

    if (parsed.steering) {
      const steeringMap = {
        left_full: -CAR_SPEC.maxSteer,
        left_slight: -toRad(14),
        center: 0,
        right_slight: toRad(14),
        right_full: CAR_SPEC.maxSteer,
      };
      car.targetSteer = steeringMap[parsed.steering];
    }

    if (parsed.stop) {
      car.targetSpeed = 0;
      car.speed = 0;
      return;
    }

    let magnitude = Math.abs(car.targetSpeed);
    if (parsed.speed === "slow") magnitude = 42;
    if (parsed.speed === "normal") magnitude = 58;
    if (parsed.speed === "fast") magnitude = 86;
    if (!parsed.speed && magnitude < 1) magnitude = 42;

    if (parsed.move || parsed.gear || parsed.speed) {
      if (car.gear === 0) {
        car.gear = parsed.gear === "D" ? 1 : -1;
      }
      car.targetSpeed = magnitude * car.gear;
      startRoundIfNeeded();
    }
  }

  let RecognitionClass = null;

  function initSpeechRecognition() {
    RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionClass) dom.micHint.textContent = "当前浏览器不支持，仍可打字玩";
  }

  function updateVoiceButton(label) {
    dom.micButton.setAttribute("aria-pressed", String(voice.enabled));
    dom.micButton.disabled = voice.enabled;
    document.getElementById("endVoiceButton").disabled = !voice.enabled;
    dom.difficultySelect.disabled = voice.enabled;
    dom.micButton.classList[voice.enabled ? "add" : "remove"]("listening");
    dom.micButton.querySelector("strong").textContent = label || (voice.enabled ? "监听已开启 · 直接说指令" : "开始监听");
  }

  function brakeForVoiceDisconnect() {
    game.controlVersion += 1;
    car.speed = 0;
    car.targetSpeed = 0;
  }

  function stopLiveVoice({ brake = true } = {}) {
    const wasActive = voice.enabled || voice.pending || game.listening;
    voice.enabled = false;
    voice.pending = false;
    voice.session += 1;
    window.clearTimeout(voice.restartTimer);
    voice.restartTimer = null;
    const recognition = speechRecognition;
    speechRecognition = null;
    game.listening = false;
    if (wasActive && brake) brakeForVoiceDisconnect();
    try { recognition?.abort(); } catch { /* A completed recognition session may already be closed. */ }
    updateVoiceButton();
    if (wasActive) setBadge("语音已关闭");
  }

  function startLiveVoice() {
    if (voice.enabled) return;
    if (document.body.dataset.screen !== "practice" || game.finished) return;
    if (!RecognitionClass) {
      showToast("麦克风不可用：请使用文字或快捷指令", "", 3000);
      dom.commandInput.focus();
      return;
    }
    voice.enabled = true;
    voice.rapidEnds = 0;
    voice.lastFingerprint = "";
    window.speechSynthesis?.cancel();
    document.getElementById("voiceTranscript").textContent = "正在开启持续监听。松手也会继续听；倒车时直接说“停”，不用再点按钮。";
    startLiveRecognition();
  }

  function endLiveVoice() {
    stopLiveVoice();
    document.getElementById("voiceTranscript").textContent = "监听已结束，车辆已刹停。下一局或继续练习时再点“开始监听”。";
  }

  function startLiveRecognition() {
    if (!voice.enabled || document.hidden || game.finished || document.body.dataset.screen !== "practice") return;
    const recognition = new RecognitionClass();
    speechRecognition = recognition;
    const session = ++voice.session;
    const startedAt = performance.now();
    const processed = new Map();
    let heardSpeech = false;
    const current = () => voice.enabled && session === voice.session && speechRecognition === recognition && !game.finished && document.body.dataset.screen === "practice";
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voice.pending = true;
    updateVoiceButton("正在连接实时语音…");
    recognition.onstart = () => {
      if (!current()) { try { recognition.abort(); } catch {} return; }
      voice.pending = false;
      game.listening = true;
      updateVoiceButton();
      setBadge("持续监听中", "listening");
      document.getElementById("voiceTranscript").textContent = "持续监听中：直接说“倒车、左转、回正、停”。说“停”只停车，不结束监听。";
    };
    recognition.onresult = event => {
      if (!current()) return;
      heardSpeech = true;
      voice.rapidEnds = 0;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        document.getElementById("voiceTranscript").textContent = `听到：${text}`;
        const actions = extractLiveActions(text);
        const seen = processed.get(index) || new Set();
        const fresh = actions.filter((action, order) => !seen.has(`${order}:${action.type}:${action.value}`));
        // Semantic order survives punctuation/filler edits; compare only the preceding revision.
        processed.set(index, new Set(actions.map((action, order) => `${order}:${action.type}:${action.value}`)));
        if (!fresh.length) {
          if (result.isFinal && !actions.length) document.getElementById("voiceTranscript").textContent = `听到：${text}。可直接说“倒车、左转、回正、停车”。`;
          continue;
        }
        // A new stop wins the current recognition update; old stop spans never block later speech.
        const stop = fresh.slice().reverse().find(action => action.type === "stop");
        const selected = stop ? [stop] : [...new Map(fresh.map(action => [action.type, action])).values()];
        const instruction = selected.map(action => action.text).join("，");
        const parsed = parseLocalCommand(instruction);
        if (!parsed.understood) continue;
        const fingerprint = JSON.stringify([parsed.stop, parsed.gear, parsed.steering, parsed.speed, parsed.move]);
        if (fingerprint === voice.lastFingerprint && liveActionStillApplied(parsed)) continue;
        voice.lastFingerprint = fingerprint;
        void submitCommand(instruction, { immediate: true, forceLocal: true, ignoreMishear: true, parsed });
      }
    };
    recognition.onerror = event => {
      if (!current()) return;
      if (event.error === "no-speech") return;
      const message = {
        "not-allowed": "麦克风权限被拒绝，已刹停。可使用文字或快捷指令。",
        "service-not-allowed": "此浏览器无法启动语音服务，已刹停。可使用文字指令。",
        "audio-capture": "未找到可用麦克风，已刹停。可使用文字指令。",
        network: "语音识别网络连接失败，已刹停。可使用文字或快捷指令。",
        aborted: "语音输入已中断，车辆已刹停。",
      }[event.error] || "语音识别已中断，已刹停。可使用文字指令。";
      stopLiveVoice();
      document.getElementById("voiceTranscript").textContent = message;
      showToast(message, "danger", 3000);
    };
    recognition.onend = () => {
      if (!current()) return;
      game.listening = false;
      voice.pending = false;
      speechRecognition = null;
      brakeForVoiceDisconnect();
      if (!heardSpeech && performance.now() - startedAt < 1000) voice.rapidEnds += 1;
      else voice.rapidEnds = 0;
      if (voice.rapidEnds >= 3) {
        stopLiveVoice();
        document.getElementById("voiceTranscript").textContent = "语音暂时无法持续连接，已刹停。请使用文字指令，或点麦克风重试。";
        return;
      }
      updateVoiceButton("语音重连中 · 已刹停");
      document.getElementById("voiceTranscript").textContent = "语音重连中，车辆已刹停。连接后请继续说指令。";
      voice.restartTimer = window.setTimeout(() => {
        voice.restartTimer = null;
        if (voice.enabled && session === voice.session) startLiveRecognition();
      }, 180);
    };
    try { recognition.start(); }
    catch {
      stopLiveVoice();
      document.getElementById("voiceTranscript").textContent = "语音启动失败，已刹停。请点麦克风重试或使用文字指令。";
    }
  }

  function liveActionStillApplied(parsed) {
    if (parsed.stop) return car.targetSpeed === 0;
    if (parsed.gear && car.gear !== (parsed.gear === "R" ? -1 : parsed.gear === "D" ? 1 : 0)) return false;
    if ((parsed.move || parsed.gear || parsed.speed) && car.targetSpeed === 0) return false;
    const steering = { left_full: -CAR_SPEC.maxSteer, left_slight: -toRad(14), center: 0, right_slight: toRad(14), right_full: CAR_SPEC.maxSteer };
    if (parsed.steering && Math.abs(car.targetSteer - steering[parsed.steering]) > .0001) return false;
    if (parsed.speed && Math.abs(car.targetSpeed) !== ({ slow: 42, normal: 58, fast: 86 })[parsed.speed]) return false;
    return true;
  }

  function extractLiveActions(rawText) {
    // Preserve offsets while excluding negated stops and non-command mentions.
    const text = rawText.replace(/不要(?:停车|停|刹车)|不用(?:停车|停|刹车)|别(?:停车|停|踩刹车|刹车)|不踩刹车|不停|停车场/g, match => " ".repeat(match.length));
    const rules = [
      ["stop", "stop", /(停下|停车|刹车|别动|不要动|停住|立刻停|马上停|停)/g],
      ["gear", "P", /(挂[Pp]挡|挂[Pp]档|[Pp]挡|[Pp]档|驻车)/g],
      ["gear", "R", /(挂倒挡|挂倒档|倒挡|倒档|倒车|往后倒|向后倒|后退|往后退|退一点|退后)/g],
      ["gear", "D", /(挂[Dd]挡|挂[Dd]档|[Dd]挡|[Dd]档|前进|往前开|向前开|往前走|往前一点|开过去|向前一点)/g],
      ["steering", "center", /(回正|打正|摆正|方向盘正|轮子回正|正回来|回一点)/g],
      ["steering", "left_full", /(左(?:边)?(?:打|转|拐)?死|向左打死|往左打死|方向盘.{0,5}左.{0,3}死|左满舵|左边到底)/g],
      ["steering", "right_full", /(右(?:边)?(?:打|转|拐)?死|向右打死|往右打死|方向盘.{0,5}右.{0,3}死|右满舵|右边到底)/g],
      ["steering", "left_slight", /(向左一点|往左一点|左打一(?:点|小圈|半圈)|左边一点|微微左|稍微左|左转一点|左一点|向左|往左|左转|打左)/g],
      ["steering", "right_slight", /(向右一点|往右一点|右打一(?:点|小圈|半圈)|右边一点|微微右|稍微右|右转一点|右一点|向右|往右|右转|打右)/g],
      ["speed", "slow", /(慢慢|慢一点|慢点|缓缓|轻一点|别太快|龟速|稳一点|悠着点)/g],
      ["speed", "fast", /(快一点|快点|加速|踩油门|油门|冲|速度快)/g],
      ["speed", "normal", /(正常速度|匀速|保持速度)/g],
      ["move", "continue", /(继续|接着|保持|就这样|再来一点|再倒一点|再走一点)/g],
    ];
    const actions = [];
    for (const [type, value, regex] of rules) {
      for (const match of text.matchAll(regex)) actions.push({ type, value, start: match.index, end: match.index + match[0].length, text: match[0] });
    }
    const filtered = actions.filter(action => !actions.some(other => other !== action && other.type === action.type && other.start <= action.start && other.end >= action.end && other.end - other.start > action.end - action.start));
    filtered.sort((a, b) => a.start - b.start || a.end - b.end);
    return filtered;
  }

  function carCorners(atCar = car) {
    return orientedRectCorners(atCar.x, atCar.y, CAR_SPEC.width, CAR_SPEC.length, atCar.angle);
  }

  function orientedRectCorners(x, y, width, height, angle) {
    const halfW = width / 2;
    const halfH = height / 2;
    const local = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return local.map((point) => ({
      x: x + point.x * cos - point.y * sin,
      y: y + point.x * sin + point.y * cos,
    }));
  }

  function obstacleCorners(obstacle) {
    const width = obstacle.width;
    const height = obstacle.type === "car" ? obstacle.length : obstacle.height;
    return orientedRectCorners(obstacle.x, obstacle.y, width, height, obstacle.angle || 0);
  }

  function polygonsIntersect(polyA, polyB) {
    const polygons = [polyA, polyB];
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i += 1) {
        const next = (i + 1) % polygon.length;
        const edge = {
          x: polygon[next].x - polygon[i].x,
          y: polygon[next].y - polygon[i].y,
        };
        const axis = { x: -edge.y, y: edge.x };
        const length = Math.hypot(axis.x, axis.y) || 1;
        axis.x /= length;
        axis.y /= length;
        const [minA, maxA] = projectPolygon(polyA, axis);
        const [minB, maxB] = projectPolygon(polyB, axis);
        if (maxA < minB || maxB < minA) return false;
      }
    }
    return true;
  }

  function projectPolygon(polygon, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const point of polygon) {
      const projection = point.x * axis.x + point.y * axis.y;
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }
    return [min, max];
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function polygonCircleIntersect(polygon, circle) {
    if (pointInPolygon(circle, polygon)) return true;
    for (let i = 0; i < polygon.length; i += 1) {
      const next = (i + 1) % polygon.length;
      if (distancePointToSegment(circle, polygon[i], polygon[next]) <= circle.radius) return true;
    }
    return false;
  }

  function collisionLabel() {
    const polygon = carCorners();
    const margin = 18;
    if (polygon.some((point) => point.x < margin || point.x > WORLD.width - margin || point.y < margin || point.y > WORLD.height - 35)) {
      return "训练场边界";
    }
    for (const obstacle of obstacles) {
      if (polygonsIntersect(polygon, obstacleCorners(obstacle))) return obstacle.label;
    }
    for (const cone of cones) {
      if (polygonCircleIntersect(polygon, cone)) return cone.label;
    }
    return "";
  }

  function registerCrash(label) {
    const now = performance.now();
    if (now - game.lastCrashAt < 850) return;
    game.lastCrashAt = now;
    game.crashes += 1;
    visual.shake = 13;
    createImpactParticles();
    updateHud();
    showToast(`撞到${label}！扣 14 分`, "danger", 2200);
    setSisterSpeech(pick([
      `完了，撞到${label}了！你刚才不是说“稳一点”吗？`,
      `${label}为什么会突然出现在那里？它是不是移动了？`,
      `我承认这次有一点点偏。就一点点。`,
    ]), "panicked");

    if (game.crashes >= 4) {
      const crashRound = game.roundId;
      window.setTimeout(() => {
        if (game.roundId === crashRound) finishGame(false);
      }, 650);
    }
  }

  function createImpactParticles() {
    for (let i = 0; i < 16; i += 1) {
      visual.particles.push({
        x: car.x + (Math.random() - 0.5) * 30,
        y: car.y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 145,
        vy: (Math.random() - 0.5) * 145,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        size: game.demo ? 8 + Math.random() * 18 : 2 + Math.random() * 4,
        color: game.demo ? pick(["#ff6830", "#ffb52e", "#fff0a0", "#777780"]) : "#ffd84b",
      });
    }
  }

  function createConfetti() {
    const palette = ["#ffd84b", "#58e39a", "#70a7ff", "#ff6b73", "#aa83ff", "#ffffff"];
    for (let i = 0; i < 100; i += 1) {
      visual.confetti.push({
        x: WORLD.width * 0.5 + (Math.random() - 0.5) * 260,
        y: 50 + Math.random() * 80,
        vx: (Math.random() - 0.5) * 170,
        vy: 25 + Math.random() * 145,
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
        width: 5 + Math.random() * 6,
        height: 3 + Math.random() * 5,
        color: pick(palette),
        life: 2.7 + Math.random() * 1.3,
      });
    }
  }

  function isCarFullyInTarget() {
    const margin = 7;
    return carCorners().every((point) => (
      point.x >= TARGET.x + margin
      && point.x <= TARGET.x + TARGET.width - margin
      && point.y >= TARGET.y + margin
      && point.y <= TARGET.y + TARGET.height - margin
    ));
  }

  function isVerticallyAligned() {
    return Math.min(angleDifference(car.angle, 0), angleDifference(car.angle, Math.PI)) <= toRad(11);
  }

  function checkParkingSuccess() {
    if (!game.started || game.finished || game.demo) return;
    const inside = isCarFullyInTarget();
    const aligned = isVerticallyAligned();

    if (inside && aligned && Math.abs(car.speed) > 2 && !game.parkingHintShown) {
      game.parkingHintShown = true;
      showToast("位置很好！现在明确说“停车”", "success", 2600);
      setSisterSpeech("我是不是已经进来了？快喊停，快！", "panicked");
    }

    if (inside && aligned && Math.abs(car.speed) < 1.25 && Math.abs(car.targetSpeed) < 0.5 && game.elapsed > 3) {
      finishGame(true);
    }
  }

  function finishGame(success) {
    if (game.finished) return;
    stopLiveVoice();
    game.finished = true;
    game.failed = !success;
    car.targetSpeed = 0;
    car.speed = 0;
    stopDemo(true);

    let score = currentScore();
    if (success) {
      const centerX = TARGET.x + TARGET.width / 2;
      const centerY = TARGET.y + TARGET.height / 2;
      const offset = Math.hypot(car.x - centerX, car.y - centerY);
      const alignment = Math.min(angleDifference(car.angle, 0), angleDifference(car.angle, Math.PI));
      const precisionBonus = clamp(Math.round(8 - offset * 0.11 - toDeg(alignment) * 0.22), 0, 8);
      score = clamp(score + precisionBonus, 0, 100);
      createConfetti();
      setSisterSpeech(score >= 90
        ? "看见没有？一把过。主要是我天赋好，和你关系也不算太大。"
        : "居然真的停进去了！我收回刚才对你教学水平的一半质疑。", "happy");
    } else {
      score = clamp(score, 0, 59);
      setSisterSpeech("四次碰撞。教练说今天先练到这里，主要是保护训练场。", "annoyed");
    }
    game.finalScore = score;
    updateHud();

    dom.finalScore.textContent = score.toString();
    dom.finalTime.textContent = formatTime(game.elapsed);
    dom.finalCrashes.textContent = game.crashes.toString();
    dom.finalUnclear.textContent = game.unclear.toString();

    if (success) {
      dom.resultEmoji.textContent = score >= 90 ? "🏆" : score >= 75 ? "🎉" : "😮‍💨";
      dom.resultTitle.textContent = score >= 90 ? "这把真能去考试了" : score >= 75 ? "居然真的停进去了" : "至少车完整进来了";
      dom.resultComment.textContent = score >= 90
        ? "小满：我宣布，今天这辆车主要听我的。"
        : game.crashes === 0
          ? "小满：没撞东西，已经超过我自己的预期。"
          : "小满：过程不重要，最后四个轮子都在车位里。";
    } else {
      dom.resultEmoji.textContent = "🚧";
      dom.resultTitle.textContent = "训练场申请了心理援助";
      dom.resultComment.textContent = "小满：不是我不想学，是这些标杆针对我。";
    }

    const resultRound = game.roundId;
    window.setTimeout(() => {
      if (game.roundId === resultRound && game.finished) openModal(dom.resultModal);
    }, success ? 1000 : 650);
  }

  function updatePhysics(dt, now) {
    if (game.finished || game.demo || document.body.dataset.screen === "home") return;

    if (game.started) game.elapsed = (now - game.startTime) / 1000;

    let speedRate = CAR_SPEC.acceleration;
    const changingDirection = Math.sign(car.speed) !== 0 && Math.sign(car.targetSpeed) !== 0 && Math.sign(car.speed) !== Math.sign(car.targetSpeed);
    if (changingDirection || Math.abs(car.targetSpeed) < Math.abs(car.speed)) speedRate = CAR_SPEC.braking;
    car.speed = approach(car.speed, car.targetSpeed, speedRate * dt);
    car.steer = approach(car.steer, car.targetSteer, CAR_SPEC.steerRate * dt);

    if (Math.abs(car.speed) < 0.03) car.speed = 0;
    if (Math.abs(car.steer) < 0.0005 && car.targetSteer === 0) car.steer = 0;

    const old = { x: car.x, y: car.y, angle: car.angle };
    if (Math.abs(car.speed) > 0.001) {
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.y -= Math.cos(car.angle) * car.speed * dt;
      car.angle = normalizeAngle(car.angle + (car.speed / CAR_SPEC.wheelBase) * Math.tan(car.steer) * dt);

      visual.trailClock += dt;
      if (visual.trailClock > 0.09 && Math.abs(car.speed) > 30 && Math.abs(car.steer) > toRad(18)) {
        visual.trailClock = 0;
        addSkidMarks();
      }

      const label = collisionLabel();
      if (label) {
        car.x = old.x;
        car.y = old.y;
        car.angle = old.angle;
        car.speed = 0;
        car.targetSpeed = 0;
        registerCrash(label);
      }
    }

    checkParkingSuccess();
    updateHud();
  }

  function addSkidMarks() {
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const rearY = CAR_SPEC.length / 2 - 13;
    for (const side of [-1, 1]) {
      const localX = side * (CAR_SPEC.width / 2 - 7);
      const localY = rearY;
      visual.skidMarks.push({
        x: car.x + localX * cos - localY * sin,
        y: car.y + localX * sin + localY * cos,
        angle: car.angle,
        life: 5.5,
      });
    }
    if (visual.skidMarks.length > 180) visual.skidMarks.splice(0, visual.skidMarks.length - 180);
  }

  function updateEffects(dt) {
    visual.targetPulse += dt;
    visual.shake = Math.max(0, visual.shake - dt * 35);
    visual.impact = Math.max(0, visual.impact - dt);
    if (!visual.impact) document.getElementById("comicCaption").classList.remove("visible");

    for (const particle of visual.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.05, dt);
      particle.vy *= Math.pow(0.05, dt);
    }
    visual.particles = visual.particles.filter((particle) => particle.life > 0);

    for (const piece of visual.confetti) {
      piece.life -= dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.vy += 90 * dt;
      piece.rotation += piece.vr * dt;
    }
    visual.confetti = visual.confetti.filter((piece) => piece.life > 0 && piece.y < WORLD.height + 40);

    for (const mark of visual.skidMarks) mark.life -= dt;
    visual.skidMarks = visual.skidMarks.filter((mark) => mark.life > 0);
  }

  // Demo choreography is cinematic; practice continues to use the vehicle physics.
  const demoScenes = [
    { duration: 5, x: 820, y: 470, angle: 90, coach: "先看示范：只发指令，不碰方向盘。", chapter: "01 / 自信出发", text: "放心，我一把过。你先别问，是哪一把。" },
    { duration: 7, x: 1100, y: 470, angle: 90, crash: true, rush: true, target: "demo-wall", coach: "往前一点，靠近墙时踩刹车。", chapter: "02 / 油门当刹车", text: "踩刹车？这个踏板吧。", punchline: "砰！踩错了！墙没动，是我把油门当刹车了。" },
    { duration: 5, x: 755, y: 450, angle: 115, coach: "挂倒挡，慢慢退回起点。", chapter: "03 / 战术撤退", text: "倒回来。这叫战术撤退，不叫方向感欠费。" },
    { duration: 7, x: 597, y: 205, angle: 180, crash: true, target: "left-car", coach: "慢慢倒，注意左侧车辆的距离。", chapter: "04 / 距离判断失误", text: "再倒一点，距离够的。", punchline: "砰！我说的够，是修车预算够。" },
    { duration: 6, x: 820, y: 470, angle: 90, coach: "重新来：倒挡，左打死，慢慢倒。", chapter: "05 / 认真三秒钟", text: "好了，认真。挂倒挡，向左打死，慢慢倒。" },
    { duration: 7, x: 730, y: 330, angle: 180, coach: "车身摆正后，方向盘回正。", chapter: "06 / 回正，继续倒", text: "车身正了，方向盘回正。刚才是喜剧，现在是技术。" },
    { duration: 7, x: 730, y: 163, angle: 180, coach: "继续倒进绿色车位，然后停车。", chapter: "07 / 终于停进去了", text: "进绿色车位，踩刹车。看！两次事故，一次奇迹。" },
  ];
  let demoFrom = null;
  let demoSceneElapsed = 0;
  let demoLastUpdate = 0;
  let demoArrived = false;
  let demoPaused = false;
  const demoWall = { id: "demo-wall", type: "rect", x: 1072, y: 470, width: 20, height: 260, angle: 0 };
  let impactAudio = null;

  function setDemoPaused(paused) {
    demoPaused = paused;
    const button = document.getElementById("demoPause");
    button.textContent = paused ? "▶ 继续" : "Ⅱ 暂停";
    button.setAttribute("aria-pressed", String(paused));
    if (paused) window.speechSynthesis?.pause();
    else window.speechSynthesis?.resume();
  }

  function enterDemoScene() {
    const scene = demoScenes[game.demoPhase];
    demoFrom = { x: car.x, y: car.y, angle: car.angle };
    demoSceneElapsed = 0;
    demoArrived = false;
    visual.demoRush = 0;
    car.gear = game.demoPhase === 1 ? 1 : -1;
    setSisterSpeech(scene.text, "neutral");
    setCoachSpeech(scene.coach);
    setBadge(`Demo · ${game.demoPhase + 1}/${demoScenes.length}`);
    document.getElementById("demoChapter").textContent = scene.chapter;
  }

  function updateDemo(now) {
    if (!game.demo) return;
    const dt = Math.max(0, (now - demoLastUpdate) / 1000);
    demoLastUpdate = now;
    if (demoPaused) return;
    const scene = demoScenes[game.demoPhase];
    // Playback controls change the animation timeline, never the coach narration rate.
    demoSceneElapsed += dt * Number(document.getElementById("demoSpeed").value);
    const t = clamp(demoSceneElapsed / (scene.duration * 0.55), 0, 1);
    const rushT = clamp((t - 0.35) / 0.65, 0, 1);
    const eased = scene.rush ? Math.pow(rushT, 3) : t * t * (3 - 2 * t);
    const candidate = {
      x: demoFrom.x + (scene.x - demoFrom.x) * eased,
      y: demoFrom.y + (scene.y - demoFrom.y) * eased,
      angle: demoFrom.angle + (toRad(scene.angle) - demoFrom.angle) * eased,
    };
    game.elapsed += dt;
    if (!demoArrived) {
      visual.demoRush = scene.rush ? rushT : 0;
      const contact = scene.crash ? sweepDemoContact(candidate, scene.target) : null;
      if (contact) {
        Object.assign(car, contact.pose);
        demoArrived = true;
        visual.demoRush = 0;
        triggerDemoImpact(contact, scene);
      } else {
        Object.assign(car, candidate);
        if (t === 1) demoArrived = true;
      }
    }
    document.getElementById("demoProgress").value = (game.demoPhase + clamp(demoSceneElapsed / scene.duration, 0, 1)) / demoScenes.length;
    updateHud();
    // Let the coach finish each instruction; student replies are subtitles only.
    if (demoSceneElapsed < scene.duration || (!game.muted && window.speechSynthesis?.speaking)) return;
    game.demoPhase += 1;
    if (game.demoPhase < demoScenes.length) enterDemoScene();
    else {
      stopDemo();
      car.gear = 0;
      car.speed = car.targetSpeed = 0;
      game.finished = true;
      createConfetti();
      setAvatarMood("happy");
      updateHud();
      openModal(document.getElementById("demoEndModal"));
    }
  }

  // Sweep between frames, then bisect the first contact so fast playback cannot tunnel.
  function sweepDemoContact(candidate, targetId) {
    const target = targetId === "demo-wall" ? demoWall : obstacles.find(item => item.id === targetId);
    const polygon = obstacleCorners(target);
    const previous = { x: car.x, y: car.y, angle: car.angle };
    const at = t => ({
      x: previous.x + (candidate.x - previous.x) * t,
      y: previous.y + (candidate.y - previous.y) * t,
      angle: previous.angle + (candidate.angle - previous.angle) * t,
    });
    const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
    const turnDistance = Math.abs(candidate.angle - previous.angle) * CAR_SPEC.length;
    const steps = Math.max(1, Math.ceil(Math.max(distance, turnDistance)));
    for (let i = 1; i <= steps; i += 1) {
      if (!polygonsIntersect(carCorners(at(i / steps)), polygon)) continue;
      let low = (i - 1) / steps, high = i / steps;
      for (let j = 0; j < 14; j += 1) {
        const mid = (low + high) / 2;
        if (polygonsIntersect(carCorners(at(mid)), polygon)) high = mid;
        else low = mid;
      }
      const pose = at(low);
      const height = target.type === "car" ? target.length : target.height;
      return { pose, point: {
        x: clamp(pose.x, target.x - target.width / 2, target.x + target.width / 2),
        y: clamp(pose.y, target.y - height / 2, target.y + height / 2),
      }};
    }
    return null;
  }

  function triggerDemoImpact(contact, scene) {
    game.crashes += 1;
    visual.shake = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 3 : 16;
    visual.impact = 1.7;
    visual.impactX = contact.point.x;
    visual.impactY = contact.point.y;
    for (let i = 0; i < 36; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 170;
      visual.particles.push({ x: contact.point.x, y: contact.point.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
        life: .5 + Math.random() * .45, maxLife: .95, size: 2 + Math.random() * 4,
        color: pick(["#ffc86e", "#fff6d4", "#df9a6c", "#e0d6b8"]),
      });
    }
    const caption = document.getElementById("comicCaption");
    caption.textContent = game.crashes === 1 ? "砰！油门当刹车" : "咚！距离判断失误";
    caption.classList.add("visible");
    showToast(game.crashes === 1 ? "墙：刹车在另一边" : "邻车：修车费谁出？", "danger", 3000);
    playImpactSound();
    setSisterSpeech(scene.punchline, "panicked");
  }

  function playImpactSound() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (game.muted || !Audio) return;
    try {
      impactAudio ||= new Audio();
      void impactAudio.resume().catch(() => {});
      const now = impactAudio.currentTime;
      const gain = impactAudio.createGain();
      gain.gain.setValueAtTime(.22, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .28);
      gain.connect(impactAudio.destination);
      const oscillator = impactAudio.createOscillator();
      oscillator.frequency.setValueAtTime(130, now);
      oscillator.frequency.exponentialRampToValueAtTime(35, now + .25);
      oscillator.connect(gain); oscillator.start(now); oscillator.stop(now + .28);
      const buffer = impactAudio.createBuffer(1, Math.ceil(impactAudio.sampleRate * .18), impactAudio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * .45;
      const noise = impactAudio.createBufferSource(); noise.buffer = buffer;
      noise.connect(gain); noise.start(now); noise.stop(now + .18);
      noise.onended = () => { oscillator.disconnect(); noise.disconnect(); gain.disconnect(); };
    } catch { /* Subtitles and visual effects remain available when browser audio is blocked. */ }
  }

  function startDemo() {
    stopDemo();
    resetGame({ silent: true });
    game.beforeDemoDifficulty = dom.difficultySelect.value;
    dom.difficultySelect.value = "0";
    game.demo = true;
    game.started = true;
    game.demoStartedAt = performance.now();
    dom.demoButton.textContent = "自己尝试 →";
    dom.demoButton.classList.add("active");
    clearLog();
    demoLastUpdate = game.demoStartedAt;
    setDemoPaused(false);
    enterDemoScene();
  }

  function stopDemo(restoreDifficulty = true) {
    if (!game.demo) return;
    setDemoPaused(false);
    game.demo = false;
    game.demoPhase = 0;
    dom.demoButton.textContent = "▶ 自动演示一遍";
    dom.demoButton.classList.remove("active");
    if (restoreDifficulty) dom.difficultySelect.value = game.beforeDemoDifficulty;
    window.speechSynthesis?.cancel();
  }

  function navigate(screen) {
    stopLiveVoice();
    stopDemo();
    window.speechSynthesis?.cancel();
    closeModal(dom.helpModal);
    closeModal(dom.resultModal);
    closeModal(document.getElementById("demoEndModal"));
    document.body.dataset.screen = screen;
    document.getElementById("homeScreen").hidden = screen !== "home";
    document.getElementById("levelScreen").hidden = screen === "home";
    document.getElementById("demoControls").hidden = screen !== "demo";
    if (window.innerWidth <= 760) document.querySelector(".log-panel").open = false;
    document.getElementById("modeLabel").textContent = screen === "demo" ? "第一关 · 爆笑 Demo" : "第一关 · 自己尝试";
    resetGame({ silent: true });
    clearLog();
    setSisterSpeech("教练，我今天一定能一把过。大概吧。", "neutral", { logIt: false });
    if (screen === "demo") startDemo();
    document.querySelector(screen === "home" ? ".home-hero .primary-button" : ".level-nav button").focus();
  }

  function drawScene() {
    ctx.save();
    const shakeX = visual.shake ? (Math.random() - 0.5) * visual.shake : 0;
    const shakeY = visual.shake ? (Math.random() - 0.5) * visual.shake : 0;
    ctx.translate(shakeX, shakeY);

    ctx.fillStyle = "#d7eccf";
    ctx.fillRect(0, 0, renderWidth, renderHeight);
    // Project the simulation plane as a diorama; collision coordinates stay unchanged.
    if (renderWidth === 720) {
      const cameraX = clamp(Math.min(car.x - 230, 410), 0, 410);
      ctx.transform(0.86, 0.07, -0.13, 0.88, 74 - cameraX * 0.86, 85);
    } else ctx.transform(0.83, 0.075, -0.18, 0.79, 165, 22);
    ctx.fillStyle = "#b6c899";
    roundRect(ctx, 0, 26, WORLD.width, WORLD.height, 26);
    ctx.fill();
    drawGround();
    drawGarden();
    drawParkingLayout();
    drawSkidMarks();
    drawTargetBay();
    drawObstacles();
    drawCones();
    if (document.body.dataset.screen === "demo") drawDemoWall();
    drawSpeedLines();
    drawPlayerCar();
    drawImpact();
    drawParticles();
    drawConfetti();

    ctx.restore();
  }

  function drawGround() {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    gradient.addColorStop(0, "#f3e6c8");
    gradient.addColorStop(1, "#e4cfad");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = "#ddc59e";
    ctx.fillRect(0, 300, WORLD.width, 350);

    for (const point of noisePoints) {
      ctx.globalAlpha = point.a;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#a8c88d";
    ctx.fillRect(0, 650, WORLD.width, 50);
    ctx.fillStyle = "#fff1c5";
    ctx.fillRect(0, 650, WORLD.width, 4);
  }

  // Garden props decorate the edge of the diorama and do not alter driving rules.
  function drawGarden() {
    ctx.save();
    ctx.fillStyle = "#c5dba4";
    roundRect(ctx, 18, 55, 332, 238, 25); ctx.fill();
    ctx.fillStyle = "#e8edc5";
    roundRect(ctx, 48, 95, 265, 150, 18); ctx.fill();
    drawClubhouse(105, 160);
    for (const [x, y, scale] of [[42, 110, 1], [325, 110, .85], [54, 270, .8], [322, 270, .8], [462, 697, .9], [632, 705, .65], [1002, 698, .85]]) drawTree(x, y, scale);
    drawFlowerBed(550, 684, 62);
    drawFlowerBed(840, 684, 95);
    drawSchoolSign(965, 27);
    ctx.restore();
  }

  function drawTree(x, y, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(77,119,65,.18)";
    ctx.beginPath(); ctx.ellipse(9, 4, 36, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#bc9670"; roundRect(ctx, -6, -35, 12, 39, 5); ctx.fill();
    const lobes = [[0,-51,30,"#72b47b"],[-18,-41,23,"#91c58b"],[18,-46,24,"#a6d193"],[0,-63,23,"#bcdfa6"]];
    for (const [cx,cy,r,color] of lobes) { ctx.fillStyle=color; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = "#eef6c6"; ctx.beginPath(); ctx.ellipse(-9,-67,11,6,-.45,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawFlowerBed(x, y, width) {
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle = "#bb9473"; roundRect(ctx,-width/2,-5,width,14,7); ctx.fill();
    ctx.fillStyle = "#819b63"; roundRect(ctx,-width/2+3,-10,width-6,12,6); ctx.fill();
    for (let i=0;i<Math.floor(width/13);i+=1) {
      const px=-width/2+9+i*13;
      ctx.fillStyle=i%2 ? "#f1a8b5" : "#ffdd88";
      for (let petal=0;petal<5;petal+=1) { const a=petal*Math.PI*2/5; ctx.beginPath(); ctx.arc(px+Math.cos(a)*3,-14+Math.sin(a)*3,3,0,Math.PI*2); ctx.fill(); }
      ctx.fillStyle="#fff8dd"; ctx.beginPath(); ctx.arc(px,-14,2,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawClubhouse(x, y) {
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle="#b1be8c"; roundRect(ctx,7,14,148,75,12); ctx.fill();
    ctx.fillStyle="#fff3d8"; roundRect(ctx,0,-12,146,91,10); ctx.fill();
    ctx.fillStyle="#e99b86"; ctx.beginPath(); ctx.moveTo(-12,-11); ctx.lineTo(72,-55); ctx.lineTo(158,-11); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#f9c4a7"; ctx.beginPath(); ctx.moveTo(-12,-11); ctx.lineTo(72,-55); ctx.lineTo(72,-11); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#9bc8c7"; roundRect(ctx,15,5,34,35,7); ctx.fill(); roundRect(ctx,100,5,30,35,7); ctx.fill();
    ctx.fillStyle="#bcba84"; roundRect(ctx,60,20,25,59,6); ctx.fill();
    ctx.fillStyle="#fff9e5"; ctx.fillRect(29,5,3,35); ctx.fillRect(15,21,34,3);
    ctx.fillStyle="#827452"; ctx.font="700 10px system-ui"; ctx.textAlign="center"; ctx.fillText("小满驾校",72,9);
    ctx.restore();
  }

  function drawSchoolSign(x, y) {
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle="#b99472"; roundRect(ctx,-3,0,6,23,3); ctx.fill();
    ctx.fillStyle="#ffe6a6"; roundRect(ctx,-48,-25,96,28,9); ctx.fill();
    ctx.strokeStyle="#cfa867"; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle="#867045"; ctx.font="700 12px system-ui"; ctx.textAlign="center"; ctx.fillText("今日宜倒车 ♡",0,-7);
    ctx.restore();
  }

  function drawParkingLayout() {
    ctx.save();
    ctx.strokeStyle = "#fffdf0";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);

    const bays = [405, 540, 675, 810, 945];
    for (const x of bays) {
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(x, 288);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(405, 38);
    ctx.lineTo(1055, 38);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,253,238,0.8)";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 18]);
    ctx.beginPath();
    ctx.moveTo(45, 484);
    ctx.lineTo(1055, 484);
    ctx.stroke();
    ctx.setLineDash([]);

    drawRoadArrow(250, 425, Math.PI / 2);
    drawRoadArrow(250, 545, -Math.PI / 2);
    drawRoadArrow(1030, 425, Math.PI / 2);
    drawRoadArrow(1030, 545, -Math.PI / 2);

    ctx.fillStyle = "#8a7556";
    ctx.font = "700 14px 'Noto Sans SC', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("小满的驾校 · 今日宜嘴硬", 48, 626);
    ctx.font = "600 10px 'DM Sans', sans-serif";
    ctx.fillStyle = "#a38b66";
    ctx.fillText("AI DRIVING TEST AREA · VOICE CONTROL ONLY", 48, 643);
    ctx.restore();
  }

  function drawRoadArrow(x, y, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#fdf3d9";
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(17, -4);
    ctx.lineTo(7, -4);
    ctx.lineTo(7, 22);
    ctx.lineTo(-7, 22);
    ctx.lineTo(-7, -4);
    ctx.lineTo(-17, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTargetBay() {
    const pulse = 0.5 + Math.sin(visual.targetPulse * 2.4) * 0.5;
    ctx.save();
    ctx.fillStyle = `rgba(83, 169, 113, ${0.23 + pulse * 0.08})`;
    roundRect(ctx, TARGET.x + 5, TARGET.y + 5, TARGET.width - 10, TARGET.height - 10, 8);
    ctx.fill();

    ctx.strokeStyle = `rgba(62, 140, 83, ${0.70 + pulse * 0.25})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 9]);
    roundRect(ctx, TARGET.x + 5, TARGET.y + 5, TARGET.width - 10, TARGET.height - 10, 8);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.translate(TARGET.x + TARGET.width / 2, TARGET.y + TARGET.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#4f8550";
    ctx.font = "800 15px 'Noto Sans SC', sans-serif";
    ctx.fillText("目标车位", 0, -7);
    ctx.fillStyle = "#63935d";
    ctx.font = "700 10px 'DM Sans', sans-serif";
    ctx.fillText("PARK HERE", 0, 10);
    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of obstacles) {
      if (obstacle.type === "car") drawParkedCar(obstacle);
      else drawRectObstacle(obstacle);
    }
  }

  function drawRectObstacle(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(obstacle.angle || 0);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, -obstacle.width / 2 + 4, -obstacle.height / 2 + 6, obstacle.width, obstacle.height, 7);
    ctx.fill();
    ctx.fillStyle = obstacle.color;
    roundRect(ctx, -obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(84,76,64,0.22)";
    ctx.fillRect(-obstacle.width / 2, -2, obstacle.width, 4);
    ctx.restore();
  }

  function drawParkedCar(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y + 7);
    ctx.rotate(obstacle.angle || 0);
    ctx.fillStyle = "rgba(116,91,58,0.18)";
    roundRect(ctx, -obstacle.width / 2 + 5, -obstacle.length / 2 + 8, obstacle.width, obstacle.length, 17);
    ctx.fill();

    ctx.fillStyle = "#a78e9d";
    roundRect(ctx, -obstacle.width / 2 + 3, -obstacle.length / 2 + 12, obstacle.width, obstacle.length, 16);
    ctx.fill();
    const paint = ctx.createLinearGradient(-obstacle.width / 2, 0, obstacle.width / 2, 0);
    paint.addColorStop(0, obstacle.color); paint.addColorStop(0.45, "#fceafa"); paint.addColorStop(1, obstacle.color);
    ctx.fillStyle = paint;
    roundRect(ctx, -obstacle.width / 2, -obstacle.length / 2, obstacle.width, obstacle.length, 16);
    ctx.fill();

    ctx.fillStyle = "#85acb9";
    roundRect(ctx, -obstacle.width / 2 + 8, -obstacle.length / 2 + 28, obstacle.width - 16, 42, 8);
    ctx.fill();
    roundRect(ctx, -obstacle.width / 2 + 8, 9, obstacle.width - 16, 40, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.fillRect(-obstacle.width / 2 + 8, -obstacle.length / 2 + 7, 13, 5);
    ctx.fillRect(obstacle.width / 2 - 21, -obstacle.length / 2 + 7, 13, 5);
    ctx.fillStyle = "rgba(255,67,77,0.65)";
    ctx.fillRect(-obstacle.width / 2 + 8, obstacle.length / 2 - 12, 13, 5);
    ctx.fillRect(obstacle.width / 2 - 21, obstacle.length / 2 - 12, 13, 5);
    ctx.restore();
  }

  function drawCones() {
    for (const cone of cones) {
      ctx.save();
      ctx.translate(cone.x, cone.y);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(4, 8, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ee987d";
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(11, 9);
      ctx.lineTo(-11, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f4f0e7";
      ctx.fillRect(-7, -1, 14, 5);
      ctx.fillStyle = "#ce8067";
      roundRect(ctx, -14, 8, 28, 6, 3);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSkidMarks() {
    ctx.save();
    for (const mark of visual.skidMarks) {
      ctx.globalAlpha = clamp(mark.life / 5.5, 0, 0.26);
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.angle);
      ctx.fillStyle = "#101115";
      roundRect(ctx, -3, -8, 6, 16, 2);
      ctx.fill();
      ctx.rotate(-mark.angle);
      ctx.translate(-mark.x, -mark.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawDemoWall() {
    ctx.save();
    ctx.fillStyle = "#c49477";
    roundRect(ctx, demoWall.x - 10, demoWall.y - 130, 20, 260, 5); ctx.fill();
    ctx.fillStyle = "#f2d2ad";
    roundRect(ctx, demoWall.x - 10, demoWall.y - 144, 20, 260, 5); ctx.fill();
    ctx.strokeStyle = "#d3ac89"; ctx.lineWidth = 2;
    for (let y = demoWall.y - 127; y < demoWall.y + 115; y += 22) {
      ctx.beginPath(); ctx.moveTo(demoWall.x - 10, y); ctx.lineTo(demoWall.x + 10, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpeedLines() {
    if (visual.demoRush < .55) return;
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
    ctx.strokeStyle = "#fff4cc"; ctx.lineWidth = 4;
    ctx.globalAlpha = visual.demoRush;
    for (const [x, offset] of [[-31, 0], [0, 14], [31, 7]]) {
      ctx.beginPath(); ctx.moveTo(x, 58 + offset); ctx.lineTo(x, 108 + offset); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerCar() {
    ctx.save();
    ctx.translate(car.x + 6, car.y + 9);
    ctx.rotate(car.angle);
    ctx.fillStyle = "rgba(116,91,58,0.22)";
    roundRect(ctx, -CAR_SPEC.width / 2, -CAR_SPEC.length / 2, CAR_SPEC.width, CAR_SPEC.length, 15);
    ctx.fill();
    ctx.restore();

    ctx.save();
    const bounce = visual.impact > 0 ? Math.sin(visual.impact * 18) * visual.impact * 5 : 0;
    ctx.translate(car.x, car.y - Math.abs(bounce));
    ctx.rotate(car.angle);
    ctx.fillStyle = "#c88f47";
    roundRect(ctx, -CAR_SPEC.width / 2 + 2, -CAR_SPEC.length / 2 + 11, CAR_SPEC.width, CAR_SPEC.length, 14);
    ctx.fill();

    drawWheel(-CAR_SPEC.width / 2 - 1, -CAR_SPEC.length / 2 + 20, car.steer);
    drawWheel(CAR_SPEC.width / 2 + 1, -CAR_SPEC.length / 2 + 20, car.steer);
    drawWheel(-CAR_SPEC.width / 2 - 1, CAR_SPEC.length / 2 - 20, 0);
    drawWheel(CAR_SPEC.width / 2 + 1, CAR_SPEC.length / 2 - 20, 0);

    const bodyGradient = ctx.createLinearGradient(-CAR_SPEC.width / 2, 0, CAR_SPEC.width / 2, 0);
    bodyGradient.addColorStop(0, "#edb75b");
    bodyGradient.addColorStop(0.48, "#ffe5a0");
    bodyGradient.addColorStop(1, "#e9ae50");
    ctx.fillStyle = bodyGradient;
    roundRect(ctx, -CAR_SPEC.width / 2, -CAR_SPEC.length / 2, CAR_SPEC.width, CAR_SPEC.length, 14);
    ctx.fill();

    const glass = ctx.createLinearGradient(-16, -25, 16, 30);
    glass.addColorStop(0, "#e2f5f4"); glass.addColorStop(.4, "#9cccd1"); glass.addColorStop(1, "#71a4b5");
    ctx.fillStyle = glass;
    roundRect(ctx, -CAR_SPEC.width / 2 + 7, -CAR_SPEC.length / 2 + 18, CAR_SPEC.width - 14, 27, 7);
    ctx.fill();
    roundRect(ctx, -CAR_SPEC.width / 2 + 7, 5, CAR_SPEC.width - 14, 28, 7);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -CAR_SPEC.length / 2 + 19);
    ctx.lineTo(0, -CAR_SPEC.length / 2 + 45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, 32);
    ctx.stroke();

    ctx.fillStyle = "#fff7cf";
    ctx.fillRect(-CAR_SPEC.width / 2 + 6, -CAR_SPEC.length / 2 + 4, 11, 5);
    ctx.fillRect(CAR_SPEC.width / 2 - 17, -CAR_SPEC.length / 2 + 4, 11, 5);

    ctx.fillStyle = car.gear === -1 ? "#f8f8ff" : "#ff5b62";
    ctx.fillRect(-CAR_SPEC.width / 2 + 6, CAR_SPEC.length / 2 - 9, 11, 5);
    ctx.fillRect(CAR_SPEC.width / 2 - 17, CAR_SPEC.length / 2 - 9, 11, 5);

    ctx.fillStyle = "rgba(20,21,25,0.72)";
    roundRect(ctx, -17, CAR_SPEC.length / 2 - 17, 34, 9, 3);
    ctx.fill();
    ctx.fillStyle = "#f3f3ef";
    ctx.font = "800 7px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AI 002", 0, CAR_SPEC.length / 2 - 10);

    ctx.fillStyle = "rgba(255,255,255,0.33)";
    roundRect(ctx, -CAR_SPEC.width / 2 + 4, -24, 4, 43, 2);
    ctx.fill();

    ctx.restore();

    if (!game.started && !game.demo) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,216,75,0.45)";
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 8]);
      ctx.beginPath();
      ctx.moveTo(car.x - 7, car.y - 52);
      ctx.bezierCurveTo(792, 404, 735, 374, 730, 322);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,216,75,0.85)";
      ctx.font = "700 11px 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("先倒车＋左打死", 765, 376);
      ctx.restore();
    }
  }

  function drawWheel(x, y, steerAngle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steerAngle);
    ctx.fillStyle = "#746953";
    roundRect(ctx, -4, -10, 8, 20, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawImpact() {
    if (visual.impact <= 0) return;
    const age = 1.7 - visual.impact;
    ctx.save(); ctx.translate(visual.impactX, visual.impactY);
    if (age < .24) {
      ctx.globalAlpha = 1 - age / .24;
      ctx.fillStyle = "#fff4be"; ctx.strokeStyle = "#eaa260"; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 20; i += 1) {
        const angle = i / 20 * Math.PI * 2;
        const r = i % 2 ? 12 : 34 + age * 55;
        const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = clamp(visual.impact / 1.7, 0, 1);
    ctx.strokeStyle = "#fff2bc"; ctx.lineWidth = Math.max(1, 5 - age * 3);
    ctx.beginPath(); ctx.ellipse(0, 0, 12 + age * 65, 8 + age * 35, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const a = i / 6 * Math.PI * 2;
      ctx.globalAlpha = Math.max(0, .5 * (1 - age / 1.7));
      ctx.fillStyle = i % 2 ? "#e3c7aa" : "#fff5e1";
      ctx.beginPath(); ctx.arc(Math.cos(a) * age * 30, Math.sin(a) * age * 18 - age * 32, 8 + age * 13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of visual.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawConfetti() {
    for (const piece of visual.confetti) {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.globalAlpha = clamp(piece.life / 1.2, 0, 1);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - game.lastFrameAt) / 1000, 0.033);
    game.lastFrameAt = timestamp;
    updateDemo(timestamp);
    updatePhysics(dt, timestamp);
    updateEffects(dt);
    drawScene();
    requestAnimationFrame(gameLoop);
  }

  function copyResultText() {
    const outcome = game.failed ? "把训练场撞到申请心理援助" : "只靠指令让嘴硬AI完成了倒车入库";
    const text = `我${outcome}：${game.finalScore}分，用时${formatTime(game.elapsed)}，碰撞${game.crashes}次。\n\n这个小游戏里我坐在“副驾驶”，不能碰方向盘，只能说“挂倒挡、左打死、回正、停车”。最离谱的是AI学员还会误听和顶嘴。\n\n#AI游戏 #VibeCoding #AI驾校 #倒车入库`;
    navigator.clipboard.writeText(text)
      .then(() => {
        dom.copyResultButton.textContent = "已复制";
        window.setTimeout(() => { dom.copyResultButton.textContent = "复制战绩文案"; }, 1600);
      })
      .catch(() => showToast("复制失败，请手动选择对话中的文案", "danger"));
  }

  function bindEvents() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.route));
    });
    dom.sendButton.addEventListener("click", () => submitCommand(dom.commandInput.value));
    dom.commandInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) submitCommand(dom.commandInput.value);
    });
    document.getElementById("demoPause").addEventListener("click", () => setDemoPaused(!demoPaused));
    window.addEventListener("resize", setupCanvas);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game.demo) setDemoPaused(true);
      if (document.hidden) stopLiveVoice();
    });
    dom.micButton.addEventListener("click", startLiveVoice);
    document.getElementById("endVoiceButton").addEventListener("click", endLiveVoice);
    dom.clearLogButton.addEventListener("click", clearLog);
    dom.resetButton.addEventListener("click", () => {
      stopLiveVoice();
      stopDemo();
      if (document.body.dataset.screen === "demo") startDemo();
      else resetGame();
      clearLog();
      showToast("已重置训练场");
    });
    dom.soundButton.addEventListener("click", () => {
      game.muted = !game.muted;
      dom.soundButton.textContent = game.muted ? "🔇" : "🔊";
      dom.soundButton.setAttribute("aria-pressed", String(!game.muted));
      if (game.muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
      showToast(game.muted ? "讲解与音效已关闭" : "讲解与音效已开启");
    });
    dom.demoButton.addEventListener("click", () => navigate(game.demo ? "practice" : "demo"));
    dom.helpButton.addEventListener("click", () => openModal(dom.helpModal));
    document.querySelectorAll("[data-close-modal='help']").forEach((element) => {
      element.addEventListener("click", () => closeModal(dom.helpModal));
    });
    dom.commandChips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-command]");
      if (!button) return;
      submitCommand(button.dataset.command);
    });
    dom.copyResultButton.addEventListener("click", copyResultText);
    dom.playAgainButton.addEventListener("click", () => {
      closeModal(dom.resultModal);
      resetGame({ keepModal: true });
      clearLog();
    });
    dom.difficultySelect.addEventListener("change", () => {
      const labels = { "0": "认真模式：不故意误听", "0.08": "迷糊模式：偶尔听反", "0.18": "暴走模式：请自求多福" };
      showToast(labels[dom.difficultySelect.value] || "难度已更新");
    });
    dom.enhancedToggle.addEventListener("change", () => {
      showToast(dom.enhancedToggle.checked
        ? "已开启增强理解；未配置服务时会自动回退"
        : "已切回零成本本地理解", "", 2400);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal(dom.helpModal);
        if (game.finished) closeModal(dom.resultModal);
      }
    });
  }

  function initVoices() {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => { availableVoices = window.speechSynthesis.getVoices(); };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
  }

  function init() {
    setupCanvas();
    bindEvents();
    const notice = document.getElementById("browserNotice");
    if (/xiaohongshu|rednote/i.test(navigator.userAgent)) {
      notice.hidden = false;
      notice.textContent = "如果麦克风不可用，可用文字或快捷指令；也可复制链接到 Safari / Chrome 打开。";
    } else if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      notice.hidden = false;
      notice.textContent = "此浏览器暂不支持语音识别，可用文字或下方快捷指令继续玩。";
    }
    if (location.hostname.endsWith("github.io")) document.querySelector(".ai-mode-row").hidden = true;
    initSpeechRecognition();
    initVoices();
    resetGame({ silent: true });
    drawScene();
    requestAnimationFrame(gameLoop);

    navigate("home");
  }

  function debugSnapshot() {
    return {
      car: {
        x: Number(car.x.toFixed(2)),
        y: Number(car.y.toFixed(2)),
        angleDegrees: Number(toDeg(car.angle).toFixed(2)),
        speed: Number(car.speed.toFixed(2)),
        targetSpeed: Number(car.targetSpeed.toFixed(2)),
        steeringDegrees: Number(toDeg(car.steer).toFixed(2)),
        targetSteeringDegrees: Number(toDeg(car.targetSteer).toFixed(2)),
      },
      game: {
        started: game.started,
        finished: game.finished,
        failed: game.failed,
        elapsed: Number(game.elapsed.toFixed(2)),
        crashes: game.crashes,
        unclear: game.unclear,
        score: currentScore(),
        commandCount: game.commandCount,
        listening: game.listening,
      },
      screen: document.body.dataset.screen,
      voice: { enabled: voice.enabled, pending: voice.pending, session: voice.session },
      demo: { active: game.demo, phase: game.demoPhase, paused: demoPaused, sceneElapsed: demoSceneElapsed },
      impact: { x: visual.impactX, y: visual.impactY, remaining: visual.impact },
      parking: {
        inside: isCarFullyInTarget(),
        aligned: isVerticallyAligned(),
      },
    };
  }

  function debugAdvance(seconds, stopWhen = null) {
    const frames = Math.ceil(seconds * 60);
    const base = performance.now();
    if (game.started) game.startTime = base - game.elapsed * 1000;
    for (let i = 0; i < frames; i += 1) {
      const now = base + (i + 1) * (1000 / 60);
      updatePhysics(1 / 60, now);
      updateEffects(1 / 60);
      if (typeof stopWhen === "function" && stopWhen()) break;
      if (game.finished) break;
    }
    drawScene();
    return debugSnapshot();
  }

  function debugAutopark() {
    const previousMuted = game.muted;
    const previousDifficulty = dom.difficultySelect.value;
    game.muted = true;
    dom.difficultySelect.value = "0";
    resetGame({ silent: true });

    applyInstruction(parseLocalCommand("挂倒挡，方向盘向左打死，慢慢倒"));
    debugAdvance(8, () => car.angle >= toRad(176));
    applyInstruction(parseLocalCommand("回正，继续倒"));
    debugAdvance(8, () => car.y <= TARGET.y + TARGET.height / 2);
    applyInstruction(parseLocalCommand("停车，踩刹车"));
    debugAdvance(2.5);

    const snapshot = debugSnapshot();
    game.muted = previousMuted;
    dom.difficultySelect.value = previousDifficulty;
    return snapshot;
  }

  window.__AI_DRIVE_DEBUG__ = {
    snapshot: debugSnapshot,
    advance: debugAdvance,
    autopark: debugAutopark,
    parse: parseLocalCommand,
    navigate,
    demoStep: updateDemo,
    pauseDemo: setDemoPaused,
    overlapsDemoTarget: targetId => polygonsIntersect(carCorners(), obstacleCorners(targetId === "demo-wall" ? demoWall : obstacles.find(item => item.id === targetId))),
  };

  init();
})();
