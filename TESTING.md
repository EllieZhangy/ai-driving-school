# Test record

Date: 2026-10-12

## Completed checks

- JavaScript syntax checks for the game and server.
- Twenty-five automated behavioral tests using a minimal browser adapter: mobile/desktop setup; exactly two demo collisions and successful final parking; clean practice reset and physics parking success; playback timing independent of narration rate; pause/resume; speech completion gating and replay; live interim commands and steering refinements; duplicate/final transcript handling, correction reversals, and punctuation/filler edits; immediate stop of a physically moving car while the same listener remains active; separate start/end controls; silent student bubbles and coach-only Demo narration; later command recovery; continuous restarts with braking; startup cancellation; recognition errors; lifecycle teardown; caption-only feedback; stale model-response rejection; sudden wall-approach acceleration; first-contact stopping at 0.75x/1x/1.25x with 16/250/1000 ms frame intervals.
- A 390 x 844 CSS-pixel viewport preview in the Codex in-app browser: portrait home layout, level entry, candy-colored UI, angled parking scene, garden props, playback selector, captions, and progress controls. This is a desktop browser viewport check, not an iPhone hardware test.
- Public Pages deployment is verified separately through its workflow result and HTTP response.

## Product film checks

- 32.000-second MP4 fully decoded without errors: 1280 x 720, 30 fps, H.264 video, AAC stereo audio at 48 kHz.
- Reviewed opening, gameplay, crash, success, and closing frames for readable Chinese typography and correct game footage.
- Original score validated for duration, stereo output, fade boundaries, and zero clipped samples; crash accents aligned at 11.6 and 17.4 seconds.
- Neutral AI-student copy, robot avatar, and language-only speech voice selection replace the previous gendered framing.

## Not yet verified on physical devices

- iPhone Safari: microphone permissions, continuous/interim recognition timing and separate start/end controls, Chinese voice availability, audio resume, performance, keyboard, and result modal.
- Android Chrome: recognition availability, provider network access, touch events, and performance.
- Xiaohongshu iOS and Android webviews: actual link entry, microphone support, voice availability, and handoff to an external browser.

## Known limits

- No approved Xiaohongshu mini program is included.
- Real-time execution begins when the browser supplies an interim recognition result; provider/network latency cannot be eliminated by this frontend.
- Browser speech APIs may be missing or fail in app webviews. Text and command chips are the supported fallback.
- Browser-provided narration may be silent when no suitable voice is installed or audio playback is restricted; subtitles remain visible.
- GitHub Pages is static; it does not host the optional model API.
- The demo is a scripted 2.5D animation, not a recording of live voice play or a full 3D simulation.
- Session time limits, production model quotas, spending caps, and downloadable result cards remain outside this update.

## Physical device acceptance checklist

Open the public URL, select practice, grant microphone access, click Start listening once, speak a movement command, then say “停” while the microphone remains open, and say “前进” without starting another recording; observe recognition text, subtitles, and immediate vehicle actions, then repeat using text with microphone access denied. Watch both crashes, pause/resume, change playback speed, complete the demo, replay, and enter a fresh practice round. Record the phone model, OS/browser version, network, recognition result, and any platform entry restrictions.
