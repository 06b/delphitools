import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { stressRuns } from 'delphitools-v2/components/tools/ipa-transcriber/gloss';
import Interlinear, {
	bandHeight,
	collapsedHeight,
} from 'delphitools-v2/components/tools/ipa-transcriber/interlinear';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import { toText, transcribe, type IpaToken } from 'delphitools-v2/lib/ipa';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import type { Dictionary } from 'delphitools-v2/lib/shavian/transliterate';
import './ipa-transcriber/ipa-transcriber.css';

const defaultText = 'Mankind, be vigilant; we loved you.';
const coreOnlyStatus = 'Core dictionary only, uncommon words are guessed';
const dash = '—';

type DictStatus = 'loading-core' | 'loading-full' | 'core-only' | 'ready';

/** The port of IPATranscriberViewController and its view model. */
export default class IpaTranscriber extends Component {
	@tracked input = defaultText;
	@tracked dictStatus: DictStatus = 'loading-core';
	@tracked core: Dictionary = new Map();
	@tracked full: Dictionary = new Map();

	constructor(owner: Owner, args: object) {
		super(owner, args);
		// ?ipaText=: the iOS launch argument
		const text = new URLSearchParams(window.location.search).get(
			'ipaText',
		);
		if (text !== null) this.input = text;
		void this.#loadDictionaries();
	}

	async #loadDictionaries() {
		const core = await loadCoreDictionary();
		if (this.isDestroyed) return;
		this.core = core;
		this.dictStatus = 'loading-full';
		try {
			const full = await loadFullDictionary();
			if (this.isDestroyed) return;
			this.full = full;
			this.dictStatus = 'ready';
		} catch (error) {
			console.error(
				'ipa full dictionary failed to load:',
				error,
			);
			if (this.isDestroyed) return;
			this.dictStatus = 'core-only';
		}
	}

	get coreOnlyStatus() {
		return coreOnlyStatus;
	}

	get loading() {
		return this.dictStatus === 'loading-core';
	}

	get loadingDetail() {
		return this.dictStatus === 'loading-core'
			? 'Loading dictionary…'
			: this.dictStatus === 'loading-full'
				? 'Loading full dictionary…'
				: undefined;
	}

	get coreOnly() {
		return this.dictStatus === 'core-only';
	}

	@cached
	get tokens(): IpaToken[] {
		if (this.loading) return [];
		const { core, full } = this;
		return transcribe(
			this.input,
			(word) => full.get(word) ?? core.get(word),
		);
	}

	get words() {
		return this.tokens.filter((t) => t.type === 'word');
	}

	get text() {
		return this.words.length ? `/${toText(this.tokens)}/` : '';
	}

	get tiles() {
		const words = this.words.length;
		const guessed = this.words.filter((w) => w.guess).length;
		const shown = (n: number) =>
			words ? n.toLocaleString() : dash;
		return [
			{ label: 'Words', value: shown(words) },
			{ label: 'Dictionary', value: shown(words - guessed) },
			{ label: 'Guessed', value: shown(guessed) },
		];
	}

	setInput = (text: string) => {
		this.input = text;
	};

	<template>
		<CanonSplit
			class="ipa-transcriber"
			@halves={{true}}
			@collapsesTo={{collapsedHeight}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<Interlinear
						@tokens={{this.tokens}}
						@label={{this.text}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading="English"
						@label="English input"
						@text={{this.input}}
						@onChange={{this.setInput}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<Result
					class="ipa-result"
					@heading="IPA"
					@text={{this.text}}
					@fileName="ipa.txt"
					@busy={{this.loading}}
				>
					<:default>
						<span class="ipa-slash">/</span>
						{{~#each
							this.tokens
							as |token|
						~}}
							{{~#if (isWord token)~}}
								<span
									class="ipa-word
										{{if
											token.guess
											'ipa-word--guess'
										}}"
									title={{token.value}}
								>
									{{~#each
										(stressRuns
											token.ipa
										)
										as |run|
									~}}
										<span
											class={{if
												run.stress
												"ipa-stress"
											}}
										>{{run.text}}</span>
									{{~/each~}}
								</span>
							{{~else~}}
								<span
								>{{token.value}}</span>
							{{~/if~}}
						{{~/each~}}
						<span class="ipa-slash">/</span>
					</:default>
					<:extra>
						{{#if this.loadingDetail}}
							<CanonRow
								class="ipa-loading"
								@title="Loading"
								@detail={{this.loadingDetail}}
							>
								<CanonLoader />
							</CanonRow>
						{{/if}}
						{{#if this.coreOnly}}
							<CanonStatus
								@text={{this.coreOnlyStatus}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
						{{#if this.words.length}}
							<div class="ipa-legend">
								<span
									class="ipa-legend-item"
								>
									<span
										class="ipa-stress ipa-legend-mark"
									>ˈ</span>
									Stress
								</span>
								<span
									class="ipa-legend-item ipa-word--guess"
								>Guessed</span>
							</div>
						{{/if}}
					</:extra>
				</Result>
				<CanonRows @framed={{true}}>
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}

function isWord(token: IpaToken): token is Extract<IpaToken, { type: 'word' }> {
	return token.type === 'word';
}
