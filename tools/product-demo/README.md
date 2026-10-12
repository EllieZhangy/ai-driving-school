# Product film source

The committed `media/product-demo.mp4` is a 32-second, 1280 x 720, 30 fps H.264/AAC product overview. Chinese copy is burned into the frames. The GIF in the root README is a silent excerpt; the linked player plays the full video with music.

`render.cjs` executes the existing `game.js` in an offscreen canvas adapter and edits excerpts from its deterministic scripted demo into a product narrative. This is game-runtime footage, not a live voice-recognition recording. No cloud model was called. The film does not claim that mobile microphone compatibility has been verified.

`generate_music.py` synthesizes an original stereo instrumental score. `mix-audio.py` adds synthetic crash accents at the impact timestamps emitted by the renderer. No third-party samples or songs are used; see `media/MUSIC-PROVENANCE.txt`.

## Reproduce

Use a compatible Node.js runtime with `@napi-rs/canvas`, Python with NumPy, and FFmpeg on PATH. Run from the repository root. Set `CANVAS_MODULE` to a canvas module path only if it is not resolvable through normal package resolution. Set `DEMO_FONT` to an installed CJK font for Chinese typography, and `FFMPEG` if the binary is not on PATH.

```bash
node tools/product-demo/render.cjs
python3 tools/product-demo/generate_music.py
python3 tools/product-demo/mix-audio.py
ffmpeg -y -i media/product-demo-silent.mp4 -i media-source/film-audio.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 160k -movflags +faststart -shortest media/product-demo.mp4
```

Review frames and intermediate audio/video are local build artifacts. Only final MP4, GIF, poster, chapter captions, and music provenance need to be published. The game's normal startup remains dependency-free.
