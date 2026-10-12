import { timings, type Timing } from 'delphitools-v2/lib/morse';

const sampleRate = 22_050;
const toneHz = 600;
// an instant gain step clicks
const rampSeconds = 0.002;
// ponytail: one buffer holds the message, so playback stops here; a buffer
// per element is the upgrade if long messages ever matter
const maximumSeconds = 120;
// no run this long fits maximumSeconds, even at 40 WPM
const maximumSymbols = 20_000;

function render(context: AudioContext, steps: Timing[]): AudioBuffer {
	const total = Math.min(
		maximumSeconds,
		steps.reduce((sum, step) => sum + step.ms / 1000, 0),
	);
	const frames = Math.ceil(total * sampleRate) + 1;
	const buffer = context.createBuffer(1, frames, sampleRate);
	const samples = buffer.getChannelData(0);
	const ramp = Math.round(rampSeconds * sampleRate);
	const step = (2 * Math.PI * toneHz) / sampleRate;
	let index = 0;
	let phase = 0;
	for (const element of steps) {
		const count = Math.min(
			Math.round((element.ms / 1000) * sampleRate),
			frames - index,
		);
		for (let i = 0; i < count; i++) {
			let gain = element.on ? 1 : 0;
			if (element.on && ramp > 0)
				gain = Math.max(
					0,
					Math.min(
						1,
						i / ramp,
						(count - 1 - i) / ramp,
					),
				);
			samples[index + i] = Math.sin(phase) * gain * 0.6;
			phase += step;
		}
		index += Math.max(0, count);
	}
	return buffer;
}

/**
 * MorseTonePlayer: the whole message as one synthesised sine buffer, played,
 * paused, looped with a word gap between repeats.
 */
export default class MorsePlayer {
	playing = false;
	paused = false;
	volume = 1;
	/** Called when playback ends by itself. */
	onEnd?: () => void;

	#context?: AudioContext;
	#source?: AudioBufferSourceNode;
	#buffer?: AudioBuffer;
	#looping = false;
	// context time at which the first pass began
	#began = 0;
	#pausedAt = 0;

	get looping() {
		return this.#looping;
	}

	/** Changing it while playing keeps the place. */
	set looping(looping: boolean) {
		this.#looping = looping;
		if (this.#source) this.#source.loop = looping;
	}

	play(morse: string, wpm: number, loops: boolean) {
		this.stop();
		this.#looping = loops;
		const steps = timings(morse.slice(0, maximumSymbols), wpm);
		if (!steps.length) return;
		// loop gap: a word space
		steps.push({ on: false, ms: (7 * 1200) / wpm });
		this.#context ??= new AudioContext();
		void this.#context.resume();
		this.#buffer = render(this.#context, steps);
		this.playing = true;
		this.#start(0);
	}

	#start(played: number) {
		const context = this.#context;
		const buffer = this.#buffer;
		if (!context || !buffer) return;
		const gain = context.createGain();
		gain.gain.value = this.volume;
		gain.connect(context.destination);
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = this.#looping;
		source.connect(gain);
		source.onended = () => {
			if (this.#source !== source) return;
			this.stop();
			this.onEnd?.();
		};
		source.start(0, played % buffer.duration);
		this.#source = source;
		this.#began = context.currentTime - played;
	}

	#halt() {
		const source = this.#source;
		this.#source = undefined;
		source?.stop();
		source?.disconnect();
	}

	/** Seconds into the message and the passes completed, while playing or paused. */
	get position(): { seconds: number; passes: number } | undefined {
		const buffer = this.#buffer;
		if (!this.playing || !buffer || !this.#context)
			return undefined;
		const played = this.paused
			? this.#pausedAt
			: this.#context.currentTime - this.#began;
		return {
			seconds: played % buffer.duration,
			passes: Math.floor(played / buffer.duration),
		};
	}

	pause() {
		if (!this.playing || this.paused || !this.#context) return;
		this.#pausedAt = this.#context.currentTime - this.#began;
		this.#halt();
		this.paused = true;
	}

	resume() {
		if (!this.playing || !this.paused) return;
		this.paused = false;
		this.#start(this.#pausedAt);
	}

	stop() {
		this.#halt();
		this.playing = false;
		this.paused = false;
	}

	dispose() {
		this.stop();
		void this.#context?.close();
		this.#context = undefined;
	}
}
