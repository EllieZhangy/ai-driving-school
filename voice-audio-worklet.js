class ParkingVoiceAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(1024);
    this.offset = 0;
  }

  process(inputs, outputs) {
    // Never send microphone audio to the speakers.
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    const input = inputs[0]?.[0];
    if (!input) return true;
    let position = 0;
    while (position < input.length) {
      const count = Math.min(input.length - position, this.samples.length - this.offset);
      this.samples.set(input.subarray(position, position + count), this.offset);
      position += count;
      this.offset += count;
      if (this.offset === this.samples.length) {
        this.port.postMessage({ type: "audio", samples: this.samples }, [this.samples.buffer]);
        this.samples = new Float32Array(1024);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("parking-voice-audio", ParkingVoiceAudio);
