"""Mix the original background cue with contact-timed synthetic impacts."""
import json
import wave
from pathlib import Path
import numpy as np
root = Path(__file__).resolve().parents[2]
with wave.open(str(root / 'media-source/music.wav'), 'rb') as inp:
    rate = inp.getframerate()
    track = np.frombuffer(inp.readframes(inp.getnframes()), dtype='<i2').astype(np.float64).reshape(-1, 2) / 32768
rng = np.random.default_rng(20261012)
for event in json.loads((root / 'media/impact-times.json').read_text()):
    length = int(rate * .26)
    t = np.arange(length) / rate
    tone = np.sin(2*np.pi*(125*t-155*t*t)) * np.exp(-t*22)
    noise = rng.uniform(-1, 1, length) * np.exp(-t*38)
    hit = .18*tone + .075*noise
    start = int(event['time'] * rate)
    track[start:start+length] += hit[:, None]
track = np.clip(track, -.82, .82)
with wave.open(str(root / 'media-source/film-audio.wav'), 'wb') as out:
    out.setnchannels(2); out.setsampwidth(2); out.setframerate(rate)
    out.writeframes((track*32767).astype('<i2').tobytes())
print(f'Audio validated: {len(track)/rate:.3f}s, {rate}Hz stereo, peak {20*np.log10(np.max(np.abs(track))):.2f}dBFS')
