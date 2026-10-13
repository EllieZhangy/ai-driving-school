# AI Driving School

A mobile-first Chinese parking game. Direct a stubborn, gender-neutral AI student from the passenger seat using voice or text. This is an entertainment prototype, not real driving instruction.

## Product overview

[![Watch the 32-second product overview](media/product-demo-preview.gif)](https://elliezhangy.github.io/ai-driving-school/product-demo.html)

**[Watch with music](https://elliezhangy.github.io/ai-driving-school/product-demo.html)** · [Download MP4](https://elliezhangy.github.io/ai-driving-school/media/product-demo.mp4)

A 32-second landscape product film introduces the concept, command-based interaction, character feedback, two comedy crashes, successful parking, and the play link. It includes Chinese captions, an original instrumental score, and synchronized crash accents. The footage is rendered from the existing scripted game demo; it is not a live microphone session or a cloud-model demonstration. The README preview is silent; click it for the full soundtrack.

Xiaoman is a fictional, gender-neutral AI student. The humor comes from overconfidence and command misunderstandings, not gender stereotypes.

## Play on your phone

Browser URL: https://EllieZhangy.github.io/ai-driving-school/

No installation or account is required. Open the HTTPS URL in a phone browser, select Level 01, and watch the comedy demo or start practice. The source remains available as `index.html` plus assets, and `ai-driving-school.html` embeds the app CSS and JavaScript. Local speech recognition still needs the adjacent `vendor/`, `models/`, and audio-worklet file served over HTTP or HTTPS.

GitHub's repository file viewer does not run the game. Use the deployed website URL for sharing and play.

## Mobile experience and demo

- Portrait layout, larger touch controls, safe-area padding, and text input that avoids iOS zoom.
- A bright, original toy-town theme with cream, mint, peach and lavender UI, rounded trees, flower beds, a clubhouse and a school sign.
- A lightweight 2.5D canvas diorama: angled ground, layered car bodies, glass shading, shadows, and a raised training platform. This is not a WebGL 3D engine.
- Two scripted comedy crashes: a sudden accelerator/brake mix-up into a visible wall, then reversing into a parked car. Swept contact checks stop the car at the first touching edge. Impact-point bursts, directional sparks, smoke, screen shake and synthesized crash audio accompany the punchlines before a successful parking finish.
- Base demo timeline is about 44 seconds, plus time needed for narration to finish. Playback options are 0.75x, 1x, and 1.25x.
- Playback speed controls animation timing only. Chinese coach narration stays at a natural rate and finishes before the next chapter; AI punchlines remain readable in the scene bubble.
- Pause/resume and progress indicators. Leaving the tab pauses the demo.
- Practice retains steering physics, braking, collision penalties, scores, subtitles, and character reactions.
- The player car has a front-facing hood arrow, bright front lights, a red rear light strip, and upright front/rear labels. Driving head-first or reversing tail-first into the bay both pass when the whole vehicle is aligned inside the bay and stopped.
- Use two explicit buttons: **Start teaching (开始教学)** opens one continuous voice session; **End teaching (结束教学)** closes it and brakes. Releasing the start button does not end recording. Say reverse, stop, and forward within that same session; a spoken stop affects only the vehicle. Recognized interim commands execute immediately through local parsing; repeated or finalized transcripts do not replay actions.
- Live voice commands bypass intentional mishearing and model round trips. Stop/brake commands take priority, set both physical and target speed to zero immediately, and invalidate older pending actions. AI student replies are always silent speech bubbles inside the game scene. Demo instructions have a separate coach bubble and are the only synthesized narration, preventing speaker confusion.
- If recognition ends naturally, the car brakes while the microphone reconnects and waits for a fresh command. Errors, leaving practice, switching away from the page, or finishing a round end live listening and stop movement.
- Text input and command chips remain available when speech recognition cannot run.

## Chinese speech recognition

The default enhanced mode uses the self-hosted [Vosk small Chinese model](https://alphacephei.com/vosk/models) and [vosk-browser](https://github.com/ccoreilly/vosk-browser). AudioWorklet sends continuous microphone frames to a local WebAssembly worker, with a command vocabulary for short words such as “倒”, “停”, “左”, and “右”. Interim text is acted on immediately; negated commands and unknown movement are excluded, while a clear stop remains effective even with unknown filler. Recognition spaces are normalized, and repeated/finalized transcripts do not replay an action.

The first use downloads approximately 42 MiB of model data plus the bundled library, then caches the model. Wait for the ready message before speaking. This mode requires a browser with AudioWorklet, WebAssembly, and microphone support. Audio stays on the device and no speech API key or speech server is required. Browser recognition remains an explicitly selectable fallback, with multiple recognition hypotheses checked for actionable commands. It may use the browser provider's servers. Failure never silently switches services.

This is a command-focused recognizer, not guaranteed recognition of every voice, accent, or noisy room. The in-browser sound-file smoke check is recorded in `TESTING.md`; physical microphone and phone testing remain separate. See `THIRD_PARTY_NOTICES.md` for model/library provenance and licenses.

Demo movement is scripted cinematic choreography. Practice uses the vehicle simulation. Demo crashes do not carry into practice.

## Deployment

`.github/workflows/pages.yml` verifies all game and speech tests, packages the public HTML, JavaScript, styles, media, vendored speech library, and Chinese model, and deploys GitHub Pages on pushes to `main`. Enable GitHub Pages with GitHub Actions as its source in repository settings. No package installation or external font downloads are required.

GitHub Pages runs static files only. The hosted game uses local command interpretation, in-browser Chinese recognition, and browser speech synthesis where available. The optional language-model toggle is hidden on `github.io`; `server.mjs` is not deployed or executed by Pages.

For a public language-model-backed version, deploy `server.mjs` behind HTTPS on a server supporting Node.js, configure the environment variables there, and keep the frontend and API under the same origin. Do not put API keys in HTML or client-side JavaScript. This prototype does not yet include production API rate limits or spending controls.

## Run locally

Requires Node.js 20 or later. No package installation is needed.

```bash
git clone https://github.com/EllieZhangy/ai-driving-school.git
cd ai-driving-school
npm start
```

Open http://localhost:8080. On macOS, double-click `start.command`; on Windows, double-click `start.bat`. A static HTTP server also works for local parsing:

```bash
python3 -m http.server 8080
```

## Optional language-model configuration

Copy `.env.example` to `.env` and set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` for an OpenAI-compatible Chat Completions provider. Restart the local server and enable enhanced interpretation. The key stays on the server. If unavailable, commands fall back to local parsing.

Browser recognition and Chinese voices depend on the browser, operating system, and network. Text commands remain usable without microphone access. The local speech mode processes audio on the device; the selectable browser mode may send speech to its provider; enhanced interpretation sends text commands to the configured model provider. Secrets, dependencies, and logs are ignored by Git.

## Commands

Short commands include “倒”, “停”, “前进”, “左”, “右”, and “回正”. You can also try “挂倒挡，方向盘向左打死，慢慢倒”, then “回正，继续倒”, and finally “停车，踩刹车”. To pass, drive or reverse into the green bay, align the whole vehicle within it, and stop.

## Validation

Run `npm test`, `node --check game.js`, `node --check voice-recognition.js`, `node --check voice-audio-worklet.js`, and `node --check server.mjs`. See `TESTING.md` for checked behavior and device limitations. `window.__AI_DRIVE_DEBUG__` exposes local simulation helpers for development.

## Selected work

- [Ming Oracle](https://ming-oracle-eta.vercel.app/) — a bilingual AI experience combining computed BaZi structure with symbolic personal reflection.
- [Daily Mood Screen](https://github.com/EllieZhangy/Daily-Mood-Screen) — a personalized macOS wallpaper pipeline using weather, photos, and mood.
- [Memory Studio](https://github.com/EllieZhangy/memory-studio) — a photo-to-poster web app with reusable visual styles.
- [Radiology Impression Prediction](https://github.com/EllieZhangy/LLM-Based-Impression-Prediction-from-Radiology-Reports) — an LLM research project for radiology report impression generation.
