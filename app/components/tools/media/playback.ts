import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import type { CanonTransport } from 'delphicanon/components/canon-readout-band';

/**
 * The iOS AVEditPlayback on a media element: Play, Pause, Stop, Loop and
 * scrub, with the playhead a readout band shows. Stop parks at the start.
 */
export default class Playback {
	@tracked playing = false;
	@tracked paused = false;
	@tracked looping = false;
	@tracked loops = 0;
	@tracked playhead: number | null = null;

	#media?: HTMLMediaElement;
	#frame = 0;

	get transport(): CanonTransport {
		return {
			playhead: this.playhead,
			playing: this.playing,
			paused: this.paused,
			looping: this.looping,
			loops: this.loops,
		};
	}

	get active() {
		return this.playing || this.paused;
	}

	/** Binds the element that plays; a new source resets the transport. */
	register = modifier((media: HTMLMediaElement) => {
		this.#media = media;
		const ended = () => {
			if (!this.looping) return this.stop();
			this.loops += 1;
			media.currentTime = 0;
			void media.play();
		};
		const reset = () => this.#idle();
		media.addEventListener('ended', ended);
		media.addEventListener('emptied', reset);
		return () => {
			media.removeEventListener('ended', ended);
			media.removeEventListener('emptied', reset);
			if (this.#media === media) this.#media = undefined;
			this.#idle();
		};
	});

	toggle = () => (this.playing ? this.pause() : this.play());

	play = () => {
		const media = this.#media;
		if (!media) return;
		this.playing = true;
		this.paused = false;
		this.playhead = media.currentTime;
		media.play().catch(() => this.#idle());
		this.#tick();
	};

	pause = () => {
		if (!this.playing) return;
		this.#media?.pause();
		this.playing = false;
		this.paused = true;
		cancelAnimationFrame(this.#frame);
		this.#read();
	};

	stop = () => {
		const media = this.#media;
		if (media) {
			media.pause();
			media.currentTime = 0;
		}
		this.#idle();
	};

	toggleLoop = () => (this.looping = !this.looping);

	scrub = (seconds: number) => {
		const media = this.#media;
		if (!media) return;
		media.currentTime = seconds;
		this.playhead = seconds;
		if (!this.playing) this.paused = true;
	};

	#idle() {
		cancelAnimationFrame(this.#frame);
		this.playing = false;
		this.paused = false;
		this.playhead = null;
	}

	#read() {
		if (this.#media) this.playhead = this.#media.currentTime;
	}

	#tick = () => {
		cancelAnimationFrame(this.#frame);
		if (!this.playing) return;
		this.#read();
		this.#frame = requestAnimationFrame(this.#tick);
	};
}
