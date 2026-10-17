import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	MARKS,
	isLost,
	sample,
	type Row,
	type Sample,
} from 'delphitools-v2/components/tools/doc-converter/blocks';

/** iOS DocConvertLedger metrics */
const ROW_HEIGHT = 34;
const HEAD_HEIGHT = 30;
const PADDING = 16;
const TWO_COLUMNS = 720;
/** bar widths of the empty rows, source and target share of a column */
const GHOST: [number, number][] = [
	[0.55, 0.7],
	[0.9, 0.8],
	[0.4, 0.5],
];

/** Height of the ledger, its band's 2 px rules included. */
export function ledgerHeight(rows: number, columns: number) {
	const lines = Math.ceil(Math.max(rows, GHOST.length) / columns);
	return HEAD_HEIGHT + lines * ROW_HEIGHT + PADDING + 4;
}

interface LedgerSignature {
	Args: {
		rows: Row[];
		from: string;
		to: string;
		fromLabel: string;
		toLabel: string;
		columns: number;
		onColumns: (columns: number) => void;
	};
}

const SampleText: TOC<{
	Args: { sample: Sample };
	Element: HTMLSpanElement;
}> = <template>
	{{#if @sample.rich}}
		<span
			class="dc-sample dc-sample--rich dc-sample--{{@sample.kind}}"
			data-level={{@sample.level}}
			...attributes
		>{{@sample.prefix}}{{#each @sample.runs as |run|}}<span
					class="{{if run.bold 'dc-b'}}
						{{if run.italic 'dc-i'}}
						{{if run.code 'dc-c'}}
						{{if run.link 'dc-a'}}"
				>{{run.text}}</span>{{/each}}</span>
	{{else}}
		<span
			class="dc-sample dc-sample--text"
			...attributes
		>{{@sample.text}}</span>
	{{/if}}
</template>;

const bar = (share: number) => htmlSafe(`inline-size: ${share * 100}%`);

/** The iOS ledger banner: each element of the source, as it reads now and as the target writes it. */
export default class Ledger extends Component<LedgerSignature> {
	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			const columns = width >= TWO_COLUMNS ? 2 : 1;
			if (columns !== this.args.columns)
				this.args.onColumns(columns);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	get lines() {
		const { rows, from, to } = this.args;
		return rows.map((row) => ({
			mark: MARKS[row.element],
			count: `×${row.count.toLocaleString()}`,
			source: sample(row.example, from),
			target: sample(row.example, to),
			lost: isLost(row.element, to),
		}));
	}

	get wide() {
		return this.args.columns === 2;
	}

	get ghosts() {
		return GHOST.map(([source, target]) => ({
			source: bar(source),
			target: bar(target),
		}));
	}

	get style() {
		const count = Math.max(this.args.rows.length, GHOST.length);
		const per = Math.ceil(count / this.args.columns);
		return htmlSafe(
			`--dc-columns: ${this.args.columns}; --dc-per-column: ${per}`,
		);
	}

	get spoken() {
		const { fromLabel, toLabel, rows } = this.args;
		const head = `${fromLabel} → ${toLabel}`;
		return rows.length
			? `${head}, ${rows.map((row) => `${MARKS[row.element]} ${row.count}`).join(', ')}`
			: head;
	}

	<template>
		<figure
			class="dc-ledger {{if this.wide 'dc-ledger--wide'}}"
			aria-label={{this.spoken}}
			style={{this.style}}
			{{this.measure}}
		>
			<div class="dc-ledger-head" aria-hidden="true">
				<span
					class="dc-ledger-from"
				>{{@fromLabel}}</span>
				<span class="dc-ledger-to">{{@toLabel}}</span>
			</div>
			<div class="dc-ledger-rows" aria-hidden="true">
				{{#each this.lines as |line|}}
					<div
						class="dc-ledger-row
							{{if
								line.lost
								'dc-ledger-row--lost'
							}}"
					>
						<span
							class="dc-ledger-mark"
						>{{line.mark}}</span>
						<SampleText
							class="dc-ledger-source"
							@sample={{line.source}}
						/>
						<span
							class="dc-ledger-arrow"
						><IconSvg
								@name="arrow-right"
							/></span>
						<SampleText
							class="dc-ledger-target"
							@sample={{line.target}}
						/>
						<span
							class="dc-ledger-count"
						>{{line.count}}</span>
					</div>
				{{else}}
					{{#each this.ghosts as |ghost|}}
						<div
							class="dc-ledger-row dc-ledger-row--ghost"
						>
							<span></span>
							<span
								class="dc-ledger-slot"
							><span
									class="dc-ledger-bar"
									style={{ghost.source}}
								></span></span>
							<span></span>
							<span
								class="dc-ledger-slot"
							><span
									class="dc-ledger-bar"
									style={{ghost.target}}
								></span></span>
						</div>
					{{/each}}
				{{/each}}
			</div>
		</figure>
	</template>
}
