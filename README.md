# AI Driving School

A mobile-first Chinese parking game. Direct a stubborn, gender-neutral AI student from the passenger seat using voice or text. This is an entertainment prototype, not real driving instruction.

## Product overview

[![Watch the 32-second product overview](media/product-demo-preview.gif)](https://elliezhangy.github.io/ai-driving-school/product-demo.html)

**[Watch with music](https://elliezhangy.github.io/ai-driving-school/product-demo.html)** · [Download MP4](https://elliezhangy.github.io/ai-driving-school/media/product-demo.mp4)

A 32-second landscape product film introduces the concept, command-based interaction, character feedback, two comedy crashes, successful parking, and the play link. It includes Chinese captions, an original instrumental score, and synchronized crash accents. The footage is rendered from the existing scripted game demo; it is not a live microphone session or a cloud-model demonstration. The README preview is silent; click it for the full soundtrack.

Xiaoman is a fictional, gender-neutral AI student. The humor comes from overconfidence and command misunderstandings, not gender stereotypes.

## Play on your phone

Browser URL: https://EllieZhangy.github.io/ai-driving-school/

No installation or account is required. Open the HTTPS URL in a phone browser, select Level 01, and watch the comedy demo or start practice. The source remains available as `index.html` plus assets, and `ai-driving-school.html` embeds the same CSS and JavaScript in a standalone HTML file.

GitHub's repository file viewer does not run the game. Use the deployed website URL for sharing and play.

## Mobile experience and demo

- Portrait layout, larger touch controls, safe-area padding, and text input that avoids iOS zoom.
- A bright, original toy-town theme with cream, mint, peach and lavender UI, rounded trees, flower beds, a clubhouse and a school sign.
- A lightweight 2.5D canvas diorama: angled ground, layered car bodies, glass shading, shadows, and a raised training platform. This is not a WebGL 3D engine.
- Two scripted comedy crashes: a sudden accelerator/brake mix-up into a visible wall, then reversing into a parked car. Swept contact checks stop the car at the first touching edge. Impact-point bursts, directional sparks, smoke, screen shake and synthesized crash audio accompany the punchlines before a successful parking finish.
- Base demo timeline is about 44 seconds, plus time needed for narration to finish. Playback options are 0.75x, 1x, and 1.25x.
- Playback speed controls animation timing only. Chinese narration stays at a natural rate and each punchline finishes before the next chapter.
- Pause/resume and progress indicators. Leaving the tab pauses the demo.
- Practice retains steering physics, braking, collision penalties, scores, subtitles, and character reactions.
- Hold the microphone button and release to send; text and command chips remain available when recognition cannot run.

Demo movement is scripted cinematic choreography. Practice uses the vehicle simulation. Demo crashes do not carry into practice.

## Xiaohongshu distribution

This repository delivers a browser game, not an approved Xiaohongshu mini program. A web URL and a Xiaohongshu mini-program entry are separate distribution paths.

For a web pilot, use the HTTPS URL in platform-permitted sharing contexts and verify that the intended entry actually opens for users. This does not guarantee that an arbitrary external URL is clickable in a note or allowed by Xiaohongshu's current distribution rules.

Xiaohongshu's official mini-program platform describes subject verification, category selection, filing, development, and release review: https://miniapp.xiaohongshu.com/. Confirm eligibility for this game with the platform before implementing a mini-program wrapper or native port. No mini-program registration, filing, or release is performed by this repository.

The page detects common Xiaohongshu webview identifiers and suggests text commands or opening the URL in Safari/Chrome if microphone recognition is unavailable. This detection is a convenience, not a guarantee of webview compatibility.

## Deployment

`.github/workflows/pages.yml` verifies the game, packages only the four public browser files, and deploys GitHub Pages on pushes to `main`. Enable GitHub Pages with GitHub Actions as its source in repository settings. No dependencies or external font downloads are required.

GitHub Pages runs static files only. The hosted game uses local command interpretation and browser speech synthesis/recognition where available. The optional language-model toggle is hidden on `github.io`; `server.mjs` is not deployed or executed by Pages.

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

Browser recognition and Chinese voices depend on the browser, operating system, and network. Text commands remain usable without microphone access. Browser recognition may send speech to its provider; enhanced interpretation sends commands to the configured model provider. Secrets, dependencies, and logs are ignored by Git.

## Commands

Try “挂倒挡，方向盘向左打死，慢慢倒”, then “回正，继续倒”, and finally “停车，踩刹车”. To pass, the car must be fully inside the green bay, aligned, and stopped.

## Validation

Run `npm test`, `node --check game.js`, and `node --check server.mjs`. See `TESTING.md` for checked behavior and device limitations. `window.__AI_DRIVE_DEBUG__` exposes local simulation helpers for development.
