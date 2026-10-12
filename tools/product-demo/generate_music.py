"""Render an original instrumental cue using procedurally synthesized sounds.

No external recordings, soundfonts, samples, or music are used.
"""

from pathlib import Path
import math
import wave
import numpy as np

SR = 48000
DURATION = 32.0
BPM = 120.0
BEAT = 60.0 / BPM
BAR = 4.0 * BEAT
OUT = Path(__file__).resolve().parents[2] / "media-source"
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(80210)
mix = np.zeros((int(SR * DURATION), 2), dtype=np.float64)


def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def add(sound, start, level=1.0, pan=0.0):
    start_sample = round(start * SR)
    skip = max(0, -start_sample)
    start_sample = max(0, start_sample)
    count = min(len(sound) - skip, len(mix) - start_sample)
    if count <= 0:
        return
    # Constant-power stereo panning, with a deliberately narrow soundstage.
    theta = (pan + 1.0) * math.pi / 4.0
    gains = np.array([math.cos(theta), math.sin(theta)])
    mix[start_sample:start_sample + count] += sound[skip:skip + count, None] * level * gains


def pluck(midi, length=1.4, brightness=1.0):
    t = np.arange(round(length * SR)) / SR
    f = hz(midi)
    attack = 1.0 - np.exp(-t / 0.007)
    # Slightly inharmonic marimba-like partials; higher partials decay rapidly.
    tone = (
        np.sin(2.0 * np.pi * f * t) * np.exp(-t / 0.43)
        + 0.26 * brightness * np.sin(2.0 * np.pi * 2.006 * f * t) * np.exp(-t / 0.18)
        + 0.105 * brightness * np.sin(2.0 * np.pi * 3.99 * f * t) * np.exp(-t / 0.08)
    )
    return tone * attack


def keys(midi, length=2.0):
    t = np.arange(round(length * SR)) / SR
    f = hz(midi)
    attack = 1.0 - np.exp(-t / 0.035)
    envelope = attack * np.exp(-t / 0.92)
    tone = (
        np.sin(2.0 * np.pi * f * t)
        + 0.15 * np.sin(2.0 * np.pi * 2.0 * f * t)
        + 0.06 * np.sin(2.0 * np.pi * 3.0 * f * t)
    )
    return tone * envelope


def bass(midi, length=0.9):
    t = np.arange(round(length * SR)) / SR
    f = hz(midi)
    envelope = (1.0 - np.exp(-t / 0.018)) * np.exp(-t / 0.34)
    return (np.sin(2.0 * np.pi * f * t) + 0.13 * np.sin(2.0 * np.pi * 2.0 * f * t)) * envelope


def kick():
    t = np.arange(round(0.25 * SR)) / SR
    frequency = 51.0 + 47.0 * np.exp(-t / 0.024)
    phase = 2.0 * np.pi * np.cumsum(frequency) / SR
    return np.sin(phase) * (1.0 - np.exp(-t / 0.002)) * np.exp(-t / 0.052)


def soft_tick():
    n = round(0.045 * SR)
    t = np.arange(n) / SR
    noise = RNG.normal(0.0, 1.0, n)
    high = noise - np.convolve(noise, np.ones(11) / 11.0, mode="same")
    return high * np.exp(-t / 0.009) * (1.0 - np.exp(-t / 0.001)) * 0.26


def brush():
    n = round(0.12 * SR)
    t = np.arange(n) / SR
    noise = RNG.normal(0.0, 1.0, n)
    soft = np.convolve(noise, np.ones(7) / 7.0, mode="same")
    envelope = (1.0 - np.exp(-t / 0.003)) * np.exp(-t / 0.027)
    return soft * envelope


# Two harmonically related eight-bar phrases, with a resolved closing cadence.
# Notes and arrangement are original to this product film.
chords = [
    [62, 66, 69, 73, 76], [62, 66, 69, 73, 76],
    [59, 62, 66, 69, 73], [59, 62, 66, 69, 73],
    [55, 62, 66, 69, 71], [55, 62, 66, 69, 71],
    [57, 62, 64, 69, 71], [57, 61, 64, 67, 71],
    [62, 66, 69, 73, 76], [62, 66, 69, 73, 76],
    [59, 62, 66, 69, 73], [59, 62, 66, 69, 73],
    [55, 62, 66, 69, 71], [57, 61, 64, 67, 71],
    [62, 66, 69, 73, 76], [62, 66, 69, 73, 76],
]
roots = [38, 38, 35, 35, 31, 31, 33, 33, 38, 38, 35, 35, 31, 33, 38, 38]
melodies = [
    [(0.0, 78), (1.5, 81), (2.5, 76)],
    [(0.5, 78), (2.0, 74), (3.0, 76)],
    [(0.0, 78), (1.5, 74), (2.5, 73)],
    [(0.5, 74), (2.0, 78), (3.0, 81)],
    [(0.0, 79), (1.5, 78), (2.5, 74)],
    [(0.5, 76), (2.0, 78), (3.0, 74)],
    [(0.0, 76), (1.5, 74), (2.5, 71)],
    [(0.5, 73), (2.0, 76), (3.0, 78)],
    [(0.0, 81), (1.5, 78), (2.5, 76)],
    [(0.5, 78), (2.0, 74), (3.0, 76)],
    [(0.0, 78), (1.5, 81), (2.5, 78)],
    [(0.5, 74), (2.0, 73), (3.0, 74)],
    [(0.0, 79), (1.5, 78), (2.5, 74)],
    [(0.0, 76), (1.5, 73), (2.5, 76)],
    [(0.0, 78), (1.5, 76), (2.5, 74)],
    [(0.0, 74)],
]

for bar, chord in enumerate(chords):
    start = bar * BAR
    activity = 0.76 if bar < 2 else (0.58 if bar >= 14 else 1.0)
    for i, note in enumerate(chord):
        add(keys(note), start + i * 0.012, 0.047 * activity, (i - 2) * 0.12)
    # Restrained plucked bass and a light half-time pulse.
    add(bass(roots[bar]), start + 0.004, 0.11 * activity, -0.06)
    if 2 <= bar < 14:
        add(bass(roots[bar] + 7), start + 2.75 * BEAT, 0.068, -0.06)
    for beat_pos, note in melodies[bar]:
        jitter = RNG.uniform(-0.006, 0.008)
        add(pluck(note, brightness=0.8), start + beat_pos * BEAT + jitter,
            RNG.uniform(0.095, 0.112) * activity, RNG.uniform(-0.26, 0.26))
    # Quiet harmonic answering notes create playful movement without cartoon music.
    if 3 <= bar < 14:
        add(pluck(chord[2] + 12, brightness=0.65), start + 3.5 * BEAT, 0.029, -0.22)
    if 2 <= bar < 14:
        add(kick(), start, 0.15, 0.0)
        add(kick(), start + 2.75 * BEAT, 0.062, 0.0)
        add(brush(), start + 2.0 * BEAT, 0.074, 0.12)
        for eighth in range(8):
            level = 0.022 if eighth % 2 else 0.027
            add(soft_tick(), start + eighth * 0.5 * BEAT + 0.012, level,
                0.25 if eighth % 2 else -0.15)

# A small synthetic room, using attenuated stereo cross-delays, avoids a dry sound.
dry = mix.copy()
for delay, gain in [(0.043, 0.105), (0.083, 0.070), (0.137, 0.035)]:
    offset = round(delay * SR)
    mix[offset:, 0] += dry[:-offset, 1] * gain
    mix[offset:, 1] += dry[:-offset, 0] * gain

# Gentle fades keep both boundaries silent and the closing title unhurried.
fade_in = round(0.18 * SR)
fade_out = round(2.15 * SR)
mix[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
mix[-fade_out:] *= (np.cos(np.linspace(0.0, math.pi / 2.0, fade_out)) ** 2.0)[:, None]
mix -= np.mean(mix, axis=0)
peak = np.max(np.abs(mix))
target_peak = 10.0 ** (-8.0 / 20.0)
mix *= target_peak / peak
# Dither before PCM quantization; the seed makes the file fully reproducible.
dither = (RNG.random(mix.shape) - RNG.random(mix.shape)) / 65536.0
pcm = np.rint(np.clip(mix + dither, -1.0, 1.0) * 32767.0).astype("<i2")
target = OUT / "music.wav"
with wave.open(str(target), "wb") as handle:
    handle.setnchannels(2)
    handle.setsampwidth(2)
    handle.setframerate(SR)
    handle.writeframes(pcm.tobytes())

with wave.open(str(target), "rb") as handle:
    loaded = np.frombuffer(handle.readframes(handle.getnframes()), dtype="<i2")
    duration = handle.getnframes() / handle.getframerate()
    channels = handle.getnchannels()
    rate = handle.getframerate()
clipped = int(np.sum(np.abs(loaded.astype(np.int32)) >= 32767))
rms = np.sqrt(np.mean((loaded.astype(np.float64) / 32767.0) ** 2.0))
print(f"Output: {target}")
print(f"Duration: {duration:.3f} seconds; channels: {channels}; sample rate: {rate} Hz")
print(f"Peak: {20 * np.log10(np.max(np.abs(loaded.astype(np.int32))) / 32767.0):.2f} dBFS")
print(f"RMS: {20 * np.log10(rms):.2f} dBFS; clipped samples: {clipped}")
