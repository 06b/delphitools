import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { and } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import type { ErrataDoc } from 'delphitools-v2/lib/errata/doc-model';
import { exportPdf } from 'delphitools-v2/lib/errata/export';
import { getSourceBytes } from 'delphitools-v2/lib/errata/source';
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import { closeMode, flashHighlight } from 'delphitools-v2/lib/errata/ui';
import {
	SEVERITY_ICON,
	badges,
	groupByPage,
	runPreflight,
	type PreflightIssue,
	type PreflightReport,
} from 'delphitools-v2/lib/pdf-preflight';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class PreflightPanel extends Component<{
	Args: { open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);

	@tracked report: PreflightReport | null = null;
	@tracked busy = false;
	@tracked failed = false;

	#runId = 0;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#runId++;
	}

	get badges() {
		return this.report
			? badges(this.report.issues).map((b) => ({
					...b,
					icon:
						b.severity === 'pass'
							? 'circle-check'
							: SEVERITY_ICON[
									b
										.severity
								],
				}))
			: [];
	}

	get groups() {
		const report = this.report;
		if (!report) return [];
		const issues = report.issues.map((issue) => ({
			...issue,
			icon: SEVERITY_ICON[issue.severity],
		}));
		const document = issues.filter((i) => !i.page);
		return [
			...(document.length
				? [{ page: 0, issues: document }]
				: []),
			...groupByPage(issues, report.pageCount),
		];
	}

	// export bytes include edits
	check = async (doc: ErrataDoc) => {
		const runId = ++this.#runId;
		await Promise.resolve();
		if (runId !== this.#runId) return;
		this.busy = true;
		try {
			const bytes = await exportPdf(doc, getSourceBytes());
			const { report, pdfDoc } = await runPreflight(
				bytes.slice().buffer,
				`${doc.name}.pdf`,
				bytes.length,
			);
			void pdfDoc?.destroy();
			if (runId !== this.#runId) return;
			this.report = report;
			this.failed = false;
		} catch (error) {
			if (runId !== this.#runId) return;
			console.error(error);
			this.report = null;
			this.failed = true;
		} finally {
			if (runId === this.#runId) this.busy = false;
		}
	};

	run = modifier(
		(_el: HTMLElement, [doc]: [ErrataDoc | null | undefined]) => {
			if (doc) void this.check(doc);
		},
	);

	goTo = (page: number) => setPageIndex(page - 1);

	showIssue = (issue: PreflightIssue) => {
		if (!issue.page) return;
		this.goTo(issue.page);
		flashHighlight(issue.page - 1, issue.rects ?? []);
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="preflight"
			@icon="list-checks"
			@label="Preflight"
			@onCancel={{closeMode}}
			@cancelLabel="Close"
			@failed={{this.failed}}
			class="z-40"
			{{this.run (if @open this.doc.current)}}
		>
			<:status>
				{{#each this.badges key="severity" as |b|}}
					<span class="err-preflight-count">
						<Icon
							@name={{b.icon}}
							class="dt-preflight-sev is-{{b.severity}}"
						/>
						{{b.label}}
					</span>
				{{/each}}
				{{#if this.busy}}
					<NdsLoader />
				{{/if}}
			</:status>
		</ToolPanel>

		<div
			class="err-preflight z-40 shadow-lg
				{{if (and @open this.report) 'is-open'}}"
		>
			{{#each this.groups key="page" as |g|}}
				<section class="err-preflight-group">
					{{#if g.page}}
						<button
							type="button"
							class="dt-preflight-page-btn"
							{{on
								"click"
								(fn
									this.goTo
									g.page
								)
							}}
						>Page {{g.page}}</button>
					{{else}}
						<h3
							class="dt-preflight-page-btn"
						>Document</h3>
					{{/if}}
					{{#each g.issues as |issue|}}
						<button
							type="button"
							class="dt-preflight-issue is-row is-compact
								{{unless
									g.page
									'is-static'
								}}"
							title={{issue.details}}
							disabled={{if
								g.page
								false
								true
							}}
							{{on
								"click"
								(fn
									this.showIssue
									issue
								)
							}}
						>
							<Icon
								@name={{issue.icon}}
								class="dt-preflight-sev is-{{issue.severity}}"
							/>
							<span
								class="dt-preflight-issue-message"
							>{{issue.message}}</span>
						</button>
					{{/each}}
				</section>
			{{/each}}
		</div>
	</template>
}
