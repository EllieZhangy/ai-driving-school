# Test record

Date: 2026-10-12

## Completed checks

- JavaScript syntax checks for the game and server.
- Seven automated behavioral tests using a minimal browser adapter: mobile/desktop setup; exactly two demo collisions and successful final parking; clean practice reset and physics parking success; playback timing independent of narration rate; pause/resume; speech completion gating and replay; cancellation or empty recording cannot submit an old command; sudden wall-approach acceleration; first-contact stopping at 0.75x/1x/1.25x with 16/250/1000 ms frame intervals.
- A 390 x 844 CSS-pixel viewport preview in the Codex in-app browser: portrait home layout, level entry, candy-colored UI, angled parking scene, garden props, playback selector, captions, and progress controls. This is a desktop browser viewport check, not an iPhone hardware test.
- Public Pages deployment is verified separately through its workflow result and HTTP response.

## Not yet verified on physical devices

- iPhone Safari: microphone permissions, hold/release behavior, Chinese voice availability, audio resume, performance, keyboard, and result modal.
- Android Chrome: recognition availability, provider network access, touch events, and performance.
- Xiaohongshu iOS and Android webviews: actual link entry, microphone support, voice availability, and handoff to an external browser.

## Known limits

- No approved Xiaohongshu mini program is included.
- Browser speech APIs may be missing or fail in app webviews. Text and command chips are the supported fallback.
- Browser-provided narration may be silent when no suitable voice is installed or audio playback is restricted; subtitles remain visible.
- GitHub Pages is static; it does not host the optional model API.
- The demo is a scripted 2.5D animation, not a recording of live voice play or a full 3D simulation.
- Session time limits, production model quotas, spending caps, and downloadable result cards remain outside this update.

## Physical device acceptance checklist

Open the public URL, select practice, grant microphone access, hold and speak a command, release, observe the subtitle/reply/car movement, then repeat using text with microphone access denied. Watch both crashes, pause/resume, change playback speed, complete the demo, replay, and enter a fresh practice round. Record the phone model, OS/browser version, network, recognition result, and any platform entry restrictions.
