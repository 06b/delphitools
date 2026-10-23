import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import { encodeWav } from 'delphitools-v2/lib/audio';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import Job from 'delphitools-v2/components/tools/media/job';
import '../../tools/media/media.css';

const rate = 22050;
const lengths = [5, 30, 120];
const lengthLabels = ['5 s', '30 s', '2 min'];
const Render = <template><IconSvg @name="audio-lines" /></template>;
const nextFrame = () => new Promise(requestAnimationFrame);

export default class JobPanelPattern extends Component {
	@tracked length = 1;
	@tracked busy = false;
	@tracked progress = 0;
	@tracked result: Blob | null = null;

	#job = 0;

	willDestroy() {
		super.willDestroy();
		this.#job++;
	}

	get seconds() {
		return lengths[this.length]!;
	}

	get readings() {
		return [
			{
				label: 'Samples',
				value: String(this.seconds * rate),
			},
			{
				label: 'Size',
				value: formatBytes(this.seconds * rate * 2),
			},
		];
	}

	get resultRow() {
		if (!this.result) return null;
		return {
			name: 'tone.wav',
			detail: `wav · ${formatBytes(this.result.size)}`,
		};
	}

	pickLength = (index: number) => {
		this.length = index;
		this.result = null;
	};

	run = () => void this.#render();

	async #render() {
		const job = ++this.#job;
		this.busy = true;
		this.progress = 0;
		this.result = null;
		const samples = new Float32Array(this.seconds * rate);
		for (let at = 0; at < samples.length; at += rate) {
			const end = Math.min(at + rate, samples.length);
			for (let i = at; i < end; i++)
				samples[i] =
					0.3 *
					Math.sin(
						(2 * Math.PI * 440 * i) / rate,
					);
			this.progress = end / samples.length;
			await nextFrame();
			if (job !== this.#job) return;
		}
		this.result = new Blob([encodeWav([samples], rate)], {
			type: 'audio/wav',
		});
		this.busy = false;
	}

	cancel = () => {
		this.#job++;
		this.busy = false;
	};

	save = () => {
		if (this.result) downloadBlob(this.result, 'tone.wav');
	};

	<template>
		<CanonSplit>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Length" />
					<CanonSegmented
						aria-label="Length"
						@items={{lengthLabels}}
						@selected={{this.length}}
						@disabled={{this.busy}}
						@onChange={{this.pickLength}}
					/>
					<Job
						@title="Render"
						@icon={{Render}}
						@failure="Failed"
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{false}}
						@result={{this.resultRow}}
						@onRun={{this.run}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Output" />
					<CanonTiles @items={{this.readings}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
