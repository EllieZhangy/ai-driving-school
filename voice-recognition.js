(function () {
  "use strict";

  const scriptURL = document.currentScript?.src || document.baseURI;
  const assetURL = (path) => new URL(path, scriptURL).href;
  const libraryURL = assetURL("vendor/vosk.js");
  const modelURL = assetURL("models/vosk-model-small-cn-0.22.tar.gz");
  const workletURL = assetURL("voice-audio-worklet.js");
  const grammar = [
    "倒", "倒车", "倒 一点", "往 后", "后 退", "后退", "退",
    "挂 倒 挡", "挂 倒 档", "倒 挡", "倒 档",
    "慢慢 倒", "往 后 倒", "继续 倒", "回 正 继续 倒",
    "停", "停车", "停 下", "停止", "刹车", "刹 车", "踩 刹车", "踩刹车",
    "前进", "前 进", "前进 挡", "前进 档", "往 前", "前", "走",
    "左", "左转", "右", "右转", "左 打死", "右 打死", "左 一点", "右 一点",
    "方向盘 回 正", "回 正", "回 一点",
    "慢", "慢一点", "慢 一点", "慢 点",
    "不要 倒", "不要 倒车", "不要 前进", "不要 停", "不要 停车",
    "不要 左转", "不要 右转", "别 倒车", "别 停", "别 前进",
    "别 左转", "别 右转", "别 倒", "不 倒车", "不 倒", "不 停",
    "不用 倒车", "不用 倒", "不用 前进", "不用 停", "不用 停车",
    "等 一下", "等等", "不 对", "不是", "取消", "[unk]",
  ];
  let libraryPromise = null;
  let modelPromise = null;
  let cachedModel = null;
  let currentSession = null;
  let sessionSequence = 0;

  function abortError() {
    return new DOMException("Voice input was cancelled", "AbortError");
  }

  function isSupported() {
    return Boolean(
      (window.AudioContext || window.webkitAudioContext) &&
      window.AudioWorkletNode && window.Worker && window.WebAssembly &&
      navigator.mediaDevices?.getUserMedia
    );
  }

  function loadLibrary() {
    if (window.Vosk?.createModel) return Promise.resolve(window.Vosk);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const timeout = setTimeout(() => finish(new Error("The Chinese speech library download timed out")), 60000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        if (error) {
          script.remove();
          reject(error);
        } else {
          resolve(window.Vosk);
        }
      }
      script.src = libraryURL;
      script.async = true;
      script.onload = () => {
        if (window.Vosk?.createModel) finish();
        else finish(new Error("The Chinese speech library could not be initialized"));
      };
      script.onerror = () => finish(new Error("The Chinese speech library could not be downloaded"));
      document.head.appendChild(script);
    }).catch((error) => {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  function prepare() {
    if (cachedModel?.ready) return Promise.resolve(cachedModel);
    if (modelPromise) return modelPromise;
    modelPromise = loadLibrary().then((Vosk) => new Promise((resolve, reject) => {
      // The upstream createModel promise does not reject every worker error.
      const model = new Vosk.Model(modelURL, -1);
      let settled = false;
      const timeout = setTimeout(() => finish(new Error("The Chinese speech model initialization timed out")), 90000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) {
          try { model.terminate(); } catch (_) { /* The worker may already have failed. */ }
          reject(error);
        } else {
          cachedModel = model;
          resolve(model);
        }
      }
      model.on("load", (message) => {
        if (message.result) finish();
        else finish(new Error("The Chinese speech model could not be initialized"));
      });
      model.on("error", (message) => {
        finish(new Error(message.error || "The Chinese speech model could not be loaded"));
      });
    })).catch((error) => {
      modelPromise = null;
      cachedModel = null;
      throw error;
    });
    return modelPromise;
  }

  function confidenceFor(result) {
    const values = (result.result || []).map((word) => word.conf)
      .filter((value) => Number.isFinite(value));
    return values.length
      ? Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length))
      : null;
  }

  async function start({ onText = () => {}, onStatus = () => {}, onError = () => {}, signal } = {}) {
    if (!isSupported()) throw new Error("Local Chinese speech recognition is not supported by this browser");
    if (signal?.aborted) throw abortError();
    currentSession?.stop();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    // Create and resume under the user's click before any network await.
    const context = new AudioContextClass({ latencyHint: "interactive" });
    let stopped = false;
    let stream = null;
    let source = null;
    let audioNode = null;
    let silentGain = null;
    let recognizer = null;
    let model = null;
    let utterance = 0;
    let lastPartial = "";
    let reportedError = false;
    const sessionID = ++sessionSequence;
    let rejectCancellation;
    const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
    // An early cancellation may happen before the startup race is attached.
    cancelled.catch(() => {});

    function stop() {
      if (stopped) return;
      stopped = true;
      signal?.removeEventListener("abort", stop);
      context.removeEventListener("statechange", onContextState);
      model?.removeEventListener("error", onModelError);
      if (audioNode) {
        audioNode.port.onmessage = null;
        audioNode.disconnect();
        audioNode.port.close();
      }
      source?.disconnect();
      silentGain?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      try { recognizer?.remove(); } catch (_) { /* The worker may already have failed. */ }
      if (context.state !== "closed") context.close().catch(() => {});
      if (currentSession === controller) currentSession = null;
      rejectCancellation(abortError());
    }

    function fail(error) {
      if (stopped) return;
      stop();
      if (!reportedError) {
        reportedError = true;
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    function onContextState() {
      if (!stopped && context.state !== "running") {
        fail(new Error("Audio input was interrupted; start teaching again to reconnect"));
      }
    }

    function onModelError(event) {
      fail(new Error(event.detail?.error || "Chinese speech recognition failed"));
      if (cachedModel === model) {
        cachedModel = null;
        modelPromise = null;
        try { model.terminate(); } catch (_) { /* The worker may already have failed. */ }
      }
    }

    function deliver(message, final) {
      if (stopped) return;
      const text = String(final ? message.result?.text || "" : message.result?.partial || "").trim();
      if (text && (final || text !== lastPartial)) {
        if (!final) lastPartial = text;
        onText(text, {
          final,
          id: `${sessionID}:${utterance}`,
          confidence: final ? confidenceFor(message.result) : null,
        });
      }
      if (final) {
        utterance += 1;
        lastPartial = "";
      }
    }

    const controller = { stop };
    currentSession = controller;
    signal?.addEventListener("abort", stop, { once: true });

    try {
      const resumePromise = context.resume();
      const streamPromise = navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      }).then((mediaStream) => {
        if (stopped) {
          mediaStream.getTracks().forEach((track) => track.stop());
          throw abortError();
        }
        stream = mediaStream;
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => fail(new Error("Microphone input ended; start teaching again to reconnect")), { once: true });
        });
        return mediaStream;
      });
      onStatus(cachedModel?.ready ? "正在连接中文语音…" : "正在准备中文识别，首次约 42 MB…");
      const prepared = await Promise.race([
        Promise.all([resumePromise, streamPromise, prepare()]),
        cancelled,
      ]);
      model = prepared[2];
      if (stopped) throw abortError();
      await Promise.race([context.audioWorklet.addModule(workletURL), cancelled]);
      if (stopped) throw abortError();
      recognizer = new model.KaldiRecognizer(context.sampleRate, JSON.stringify(grammar));
      model.addEventListener("error", onModelError);
      recognizer.setWords(true);
      recognizer.on("partialresult", (message) => deliver(message, false));
      recognizer.on("result", (message) => deliver(message, true));
      recognizer.on("error", (message) => fail(new Error(message.error || "Chinese speech recognition failed")));

      source = context.createMediaStreamSource(stream);
      audioNode = new AudioWorkletNode(context, "parking-voice-audio", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
      });
      audioNode.addEventListener("processorerror", () => fail(new Error("Audio processing was interrupted; start teaching again to reconnect")), { once: true });
      audioNode.port.onmessage = (event) => {
        if (stopped || event.data?.type !== "audio") return;
        try {
          recognizer.acceptWaveformFloat(event.data.samples, context.sampleRate);
        } catch (error) {
          fail(error);
        }
      };
      // A silent destination keeps the worklet processing without microphone echo.
      silentGain = context.createGain();
      silentGain.gain.value = 0;
      source.connect(audioNode);
      audioNode.connect(silentGain);
      silentGain.connect(context.destination);
      context.addEventListener("statechange", onContextState);
      if (context.state !== "running") throw new Error("Audio input could not start; try starting teaching again");
      onStatus("正在听你指挥");
      return controller;
    } catch (error) {
      const wasStopped = stopped;
      stop();
      if (!wasStopped && !reportedError && error.name !== "AbortError") {
        reportedError = true;
        onError(error);
      }
      throw error;
    }
  }

  window.ParkingSpeech = { isSupported, prepare, start };
})();
