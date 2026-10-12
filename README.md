# AI Driving School

A Chinese voice-command parking game. Sit in the passenger seat and coach Xiaoman into a parking bay using speech or text.

## Experience

- A home screen with a selectable Level 01: reverse parking.
- Watch a comedy demo or enter practice directly.
- The demo features three cartoon crashes, exaggerated sparks, character jokes, and a successful parking finish.
- Replay the demo, try the level yourself, or return home after watching.
- Adjustable demo narration speed: 0.65x, 0.8x (default), or 1x. Scenes wait for speech to finish.
- Practice retains steering physics, braking, collision penalties, scoring, character expressions, and optional command interpretation.
- Demo movement is scripted cinematic choreography; practice uses the vehicle simulation. Demo crashes do not count toward a practice result.

## Run locally

Requires Node.js 20 or later. No package installation is needed.

```bash
git clone https://github.com/EllieZhangy/ai-driving-school.git
cd ai-driving-school
npm start
```

Open http://localhost:8080. Chrome or Edge is recommended for Chinese speech recognition. Text input remains available if microphone access or recognition is unavailable.

On macOS, double-click `start.command`; on Windows, double-click `start.bat`.

For local command parsing only, a static server also works:

```bash
python3 -m http.server 8080
```

`ai-driving-school.html` is a standalone version with the same styles and game script embedded.

## Commands

Try “挂倒挡，方向盘向左打死，慢慢倒”, then “回正，继续倒”, and finally “停车，踩刹车”. The car must be fully inside the green bay, aligned, and stopped to pass.

## Optional language-model enhancement

Copy `.env.example` to `.env`, configure an OpenAI-compatible Chat Completions endpoint, model, and server-side API key, then restart the server. If unavailable, the game falls back to local parsing.

## Privacy

API keys stay on the local server. Browser speech recognition may use a browser-provider cloud service. Enhanced text interpretation sends commands to the configured model provider. `.env`, dependencies, and logs are excluded from Git.

## Verification

Run `node --check game.js` and `node --check server.mjs`. In the browser, verify home navigation, demo completion/replay, practice reset, command input, and parking success. The browser console exposes `window.__AI_DRIVE_DEBUG__` for simulation checks.
