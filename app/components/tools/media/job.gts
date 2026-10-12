import Component from '@glimmer/component';
import type { ComponentLike } from '@glint/template';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';

export interface JobResult {
	name: string;
	detail: string;
}

export interface JobSignature {
	Args: {
		/** The verb on the export button. */
		title: string;
		icon: ComponentLike;
		/** Shown when the job fails. */
		failure: string;
		disabled?: boolean;
		busy: boolean;
		/** 0 to 1 while busy; none for a job that cannot tell, which shows the loader alone. */
		progress?: number;
		failed: boolean;
		result?: JobResult | null;
		onRun: () => void;
		/** Shows Cancel while busy. */
		onCancel?: () => void;
		onSave: () => void;
	};
}

const Cancel = <template><IconSvg @name="x" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

/**
 * The iOS AVEditJobPanel, as rows for a CanonRows: the export button,
 * progress with Cancel, then the finished file with Download (a workflow
 * passes it along) in place of Preview and Share.
 */
export default class Job extends Component<JobSignature> {
	get share() {
		return this.args.progress ?? 0;
	}

	get percent() {
		const { progress } = this.args;
		return progress === undefined
			? ''
			: `${Math.round(progress * 100)}%`;
	}

	<template>
		{{#if @busy}}
			<CanonRow
				class="media-job-progress"
				@title="Processing…"
			>
				<span class="media-job-percent">
					<CanonLoader @cell={{5}} @gap={{1}} />
					<span
						role="status"
					>{{this.percent}}</span>
				</span>
			</CanonRow>
			{{#if this.percent}}
				<CanonBar
					class="media-job-bar"
					@share={{this.share}}
				/>
			{{/if}}
			{{#if @onCancel}}
				<CanonButton
					class="media-job-cancel"
					@text="Cancel"
					@icon={{Cancel}}
					@onClick={{@onCancel}}
				/>
			{{/if}}
		{{else}}
			<CanonButton
				class="media-job-run"
				@kind="primary"
				@text={{@title}}
				@icon={{@icon}}
				@iconStyle="oversized"
				@disabled={{@disabled}}
				@onClick={{@onRun}}
			/>
			{{#if @failed}}
				<CanonStatus
					@text={{@failure}}
					@tone="warn"
					@row={{true}}
				/>
			{{/if}}
			{{#if @result}}
				<CanonHeading @text="Result" />
				<CanonRow
					class="media-job-result"
					@title={{@result.name}}
					@detail={{@result.detail}}
				/>
				<CanonButton
					class="media-job-save"
					@kind="primary"
					@text={{passAlong "Download"}}
					@icon={{Save}}
					@onClick={{@onSave}}
				/>
			{{/if}}
		{{/if}}
	</template>
}
