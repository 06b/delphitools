import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	CATEGORIES,
	SEVERITY_ICON,
	badges,
	formatSize,
	groupByPage,
	plural,
	ptsToMm,
	runPreflight,
	type FontInfo,
	type PageBox,
	type PageInfo,
	type PreflightIssue,
	type PreflightReport,
} from 'delphitools-v2/lib/pdf-preflight';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const ACCEPT = '.pdf,application/pdf';

/** in css px */
const PREVIEW_WIDTH = 600;

interface PdfFile {
	name: string;
	size: number;
	buffer: ArrayBuffer;
}

interface DisplayIssue extends PreflightIssue {
	key: string;
	icon: string;
}

const BOX_COLOURS = {
	trim: '#3b82f6',
	bleed: '#ef4444',
	crop: '#22c55e',
};

async function drawPage(
	canvas: HTMLCanvasElement,
	doc: PDFDocumentProxy,
	info: PageInfo,
	pageNumber: number,
	cancelled: () => boolean,
): Promise<void> {
	const page = await doc.getPage(pageNumber);
	try {
		const scale =
			PREVIEW_WIDTH / page.getViewport({ scale: 1 }).width;
		const viewport = page.getViewport({ scale });

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		await page.render({ canvas, viewport }).promise;
		if (cancelled()) return;

		ctx.save();
		ctx.lineWidth = 1.5;
		ctx.setLineDash([6, 4]);
		for (const [box, colour] of [
			[info.trimBox, BOX_COLOURS.trim],
			[info.bleedBox, BOX_COLOURS.bleed],
			[info.cropBox, BOX_COLOURS.crop],
		] as const) {
			if (!box) continue;
			ctx.strokeStyle = colour;
			// pdf y-up, canvas y-down
			ctx.strokeRect(
				(box.x - info.mediaBox.x) * scale,
				canvas.height -
					(box.y + box.height - info.mediaBox.y) *
						scale,
				box.width * scale,
				box.height * scale,
			);
		}
		ctx.restore();
	} finally {
		page.cleanup();
	}
}

export default class PdfPreflightTool extends Component {
	@tracked file: PdfFile | null = null;
	@tracked error: string | null = null;
	@tracked dragActive = false;
	@tracked analysing = false;
	@tracked report: PreflightReport | null = null;
	@tracked pdfDoc: PDFDocumentProxy | null = null;
	@tracked currentPage = 1;

	/** latest-wins analysis runs */
	#runId = 0;

	willDestroy() {
		super.willDestroy();
		this.#destroyDoc();
	}

	#destroyDoc() {
		if (!this.pdfDoc) return;
		void this.pdfDoc.destroy();
		this.pdfDoc = null;
	}

	get fileSizeLabel() {
		return formatSize(this.file?.size ?? 0);
	}

	get showReport() {
		return this.report !== null && !this.analysing;
	}

	get pageCount() {
		return this.report?.pageCount ?? 0;
	}

	get displayIssues(): DisplayIssue[] {
		return (this.report?.issues ?? []).map((issue, index) => ({
			...issue,
			key: String(index),
			icon: SEVERITY_ICON[issue.severity],
		}));
	}

	get errorCount() {
		return this.displayIssues.filter((i) => i.severity === 'error')
			.length;
	}

	get isReady() {
		return this.errorCount === 0;
	}

	get verdictDetail() {
		return this.isReady
			? 'No critical issues found'
			: `${this.errorCount} error${plural(this.errorCount)} must be resolved before printing`;
	}

	get badges() {
		return badges(this.displayIssues);
	}

	get summaryRows() {
		const report = this.report;
		if (!report) return [];
		const embedded = report.fonts.filter((f) => f.embedded).length;
		return [
			{ label: 'PDF Version', value: report.pdfVersion },
			{ label: 'Pages', value: String(report.pageCount) },
			{
				label: 'File Size',
				value: formatSize(report.fileSize),
			},
			{
				label: 'Encrypted',
				value: report.encrypted ? 'Yes' : 'No',
			},
			{
				label: 'Fonts',
				value: `${report.fonts.length} (${embedded} embedded)`,
			},
		];
	}

	get fontRows() {
		return (this.report?.fonts ?? []).map((font, index) => ({
			font,
			key: String(index),
			state: font.embedded ? 'Embedded' : 'Not embedded',
			downloadTitle: `Download ${font.name}${font.extension ?? ''}`,
		}));
	}

	get issueCategories() {
		const issues = this.displayIssues;
		return CATEGORIES.map((category) => ({
			...category,
			issues: issues.filter(
				(i) => i.category === category.id,
			),
		})).filter((group) => group.issues.length > 0);
	}

	get issuePages() {
		return groupByPage(
			this.displayIssues,
			this.report?.pageCount ?? 0,
		);
	}

	get currentPageIssues() {
		return this.displayIssues.filter(
			(i) => i.page === this.currentPage,
		);
	}

	get currentPageInfo(): PageInfo | undefined {
		return this.report?.pages[this.currentPage - 1];
	}

	get pageDimensions() {
		const info = this.currentPageInfo;
		if (!info) return null;
		const box = (b: PageBox) =>
			`${b.width.toFixed(0)} x ${b.height.toFixed(0)}pt`;
		return {
			size: `${info.width.toFixed(0)} x ${info.height.toFixed(0)}pt (${ptsToMm(info.width).toFixed(0)} x ${ptsToMm(info.height).toFixed(0)}mm)`,
			trim: info.trimBox ? box(info.trimBox) : null,
			bleed: info.bleedBox ? box(info.bleedBox) : null,
		};
	}

	get atFirstPage() {
		return this.currentPage <= 1;
	}

	get atLastPage() {
		return this.currentPage >= this.pageCount;
	}

	readFile = (candidate: File) => {
		this.error = null;

		if (candidate.type && candidate.type !== 'application/pdf') {
			this.error = 'Please upload a PDF file.';
			return;
		}

		if (!candidate.name.toLowerCase().endsWith('.pdf')) {
			this.error =
				'Please upload a file with a .pdf extension.';
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const buffer = reader.result as ArrayBuffer;
			const magic = String.fromCharCode(
				...new Uint8Array(buffer.slice(0, 5)),
			);
			if (!magic.startsWith('%PDF')) {
				this.error =
					'The file does not appear to be a valid PDF.';
				return;
			}

			const file = {
				name: candidate.name,
				size: candidate.size,
				buffer,
			};
			this.file = file;
			void this.analyse(file);
		};
		reader.onerror = () => {
			this.error =
				'Failed to read the file. Please try again.';
		};
		reader.readAsArrayBuffer(candidate);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// allow re-picking same file
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		this.dragActive = false;
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// default navigates; dragover refires
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
		if (!this.dragActive) this.dragActive = true;
	};

	endDrag = (event: DragEvent) => {
		event.preventDefault();
		this.dragActive = false;
	};

	clear = () => {
		this.#runId++;
		this.#destroyDoc();
		this.file = null;
		this.error = null;
		this.report = null;
		this.analysing = false;
		this.currentPage = 1;
	};

	analyse = async (file: PdfFile) => {
		const runId = ++this.#runId;
		this.analysing = true;
		this.error = null;
		this.report = null;
		this.currentPage = 1;
		this.#destroyDoc();

		try {
			const { report, pdfDoc } = await runPreflight(
				file.buffer,
				file.name,
				file.size,
			);
			if (runId !== this.#runId) {
				void pdfDoc?.destroy();
				return;
			}
			this.pdfDoc = pdfDoc;
			this.report = report;
		} catch (e) {
			if (runId !== this.#runId) return;
			// import failure = parse error
			console.error('pdf-preflight analysis failed:', e);
			const message = e instanceof Error ? e.message : '';
			this.error =
				message.includes('encrypted') ||
				message.includes('password')
					? 'This PDF is encrypted or password-protected and cannot be analysed.'
					: 'Could not parse this PDF file.';
		} finally {
			if (runId === this.#runId) this.analysing = false;
		}
	};

	goToPage = (page: number) => {
		this.currentPage = Math.max(
			1,
			Math.min(this.pageCount || 1, page),
		);
	};

	previousPage = () => this.goToPage(this.currentPage - 1);
	nextPage = () => this.goToPage(this.currentPage + 1);

	/** page-less issues inert */
	goToIssuePage = (issue: PreflightIssue) => {
		if (issue.page) this.goToPage(issue.page);
	};

	// autotracked: no dependency list
	renderPreview = modifier((canvas: HTMLCanvasElement) => {
		const doc = this.pdfDoc;
		const info = this.currentPageInfo;
		const pageNumber = this.currentPage;
		if (!doc || !info) return;

		let cancelled = false;
		void drawPage(canvas, doc, info, pageNumber, () => cancelled);
		return () => {
			cancelled = true;
		};
	});

	downloadFont = (font: FontInfo) => {
		const bytes = font.data;
		if (!bytes) return;
		// BlobPart rejects ArrayBufferLike view
		const buffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
		downloadBlob(
			new Blob([buffer], {
				type: 'application/octet-stream',
			}),
			`${font.name}${font.extension ?? ''}`,
		);
	};

	<template>
		<div
			class="dt-preflight"
			{{filePaste this.readFile accept=ACCEPT}}
		>
			<div class="dt-preflight-frame">
				{{#if this.file}}
					<div class="dt-preflight-file">
						<Icon
							@name="file-text"
							class="dt-preflight-file-icon"
						/>
						<span
							class="dt-preflight-file-meta"
						>
							<span
								class="dt-preflight-file-name"
							>{{this.file.name}}</span>
							<span
								class="dt-preflight-file-size"
							>{{this.fileSizeLabel}}</span>
						</span>
						<button
							type="button"
							class="dt-preflight-file-clear"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="x" />
							<span
								class="dt-sr-only"
							>Remove file</span>
						</button>
					</div>
				{{else}}
					<label
						class="dt-preflight-drop
							{{if
								this.dragActive
								'is-active'
							}}"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
						{{on "dragleave" this.endDrag}}
					>
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-preflight-drop-title"
						>Drop a PDF here</span>
						<span
							class="dt-preflight-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				{{/if}}

				{{#if this.analysing}}
					<div class="dt-preflight-busy">
						<NdsLoader class="is-stage" />
						<span>Analysing PDF...</span>
					</div>
				{{/if}}
			</div>

			{{#if this.error}}
				<p class="dt-preflight-error">{{this.error}}</p>
			{{/if}}

			{{#if this.showReport}}
				<div class="dt-preflight-report">
					<div class="dt-preflight-panel">
						<h3
							class="dt-preflight-panel-title"
						>Page Preview</h3>

						{{#if this.pdfDoc}}
							<div
								class="dt-preflight-stage"
							>
								<canvas
									{{this.renderPreview}}
								></canvas>
							</div>

							<div
								class="dt-preflight-nav"
							>
								<button
									type="button"
									class="dt-preflight-nav-btn"
									disabled={{this.atFirstPage}}
									{{on
										"click"
										this.previousPage
									}}
								>
									<Icon
										@name="chevron-left"
									/>
									<span
										class="dt-sr-only"
									>Previous
										page</span>
								</button>
								<span
									class="dt-preflight-nav-label"
								>Page
									{{this.currentPage}}
									of
									{{this.pageCount}}</span>
								<button
									type="button"
									class="dt-preflight-nav-btn"
									disabled={{this.atLastPage}}
									{{on
										"click"
										this.nextPage
									}}
								>
									<Icon
										@name="chevron-right"
									/>
									<span
										class="dt-sr-only"
									>Next
										page</span>
								</button>
							</div>

							<div
								class="dt-preflight-legend"
							>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-trim"
									></span>
									Trim
								</span>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-bleed"
									></span>
									Bleed
								</span>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-crop"
									></span>
									Crop
								</span>
							</div>
						{{else}}
							<p
								class="dt-preflight-empty"
							>Page preview
								unavailable</p>
						{{/if}}

						{{#if this.pageDimensions}}
							<div
								class="dt-preflight-dims"
							>
								<p><span>Page
										size:</span>
									{{this.pageDimensions.size}}</p>
								{{#if
									this.pageDimensions.trim
								}}
									<p><span
										>Trim:</span>
										{{this.pageDimensions.trim}}</p>
								{{/if}}
								{{#if
									this.pageDimensions.bleed
								}}
									<p><span
										>Bleed:</span>
										{{this.pageDimensions.bleed}}</p>
								{{/if}}
							</div>
						{{/if}}

						{{#if
							this.currentPageIssues.length
						}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-subhead"
								>Page
									{{this.currentPage}}
									issues</h4>
								<div
									class="dt-preflight-list is-flush"
								>
									{{#each
										this.currentPageIssues
										key="key"
										as |issue|
									}}
										<div
											class="dt-preflight-issue"
										>
											<Icon
												@name={{issue.icon}}
												class="dt-preflight-sev is-{{issue.severity}}"
											/>
											<span
												class="dt-preflight-issue-body"
											>
												<span
													class="dt-preflight-issue-message"
												>{{issue.message}}</span>
												{{#if
													issue.details
												}}
													<span
														class="dt-preflight-issue-details"
													>{{issue.details}}</span>
												{{/if}}
											</span>
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}
					</div>

					<div class="dt-preflight-panel">
						<div
							class="dt-preflight-verdict
								{{if
									this.isReady
									'is-pass'
									'is-fail'
								}}"
						>
							<Icon
								@name={{if
									this.isReady
									"circle-check"
									"circle-x"
								}}
							/>
							<span
								class="dt-preflight-verdict-body"
							>
								<span
									class="dt-preflight-verdict-title"
								>{{if
										this.isReady
										"Ready for print"
										"Issues found"
									}}</span>
								<span
									class="dt-preflight-verdict-detail"
								>{{this.verdictDetail}}</span>
							</span>
						</div>

						<div
							class="dt-preflight-badges"
						>
							{{#each
								this.badges
								key="severity"
								as |badge|
							}}
								<span
									class="dt-preflight-badge is-{{badge.severity}}"
								>{{badge.label}}</span>
							{{/each}}
						</div>

						<div
							class="dt-preflight-summary"
						>
							{{#each
								this.summaryRows
								key="label"
								as |row|
							}}
								<div
									class="dt-preflight-summary-row"
								>
									<span
										class="dt-preflight-summary-label"
									>{{row.label}}</span>
									<span
										class="dt-preflight-summary-value"
									>{{row.value}}</span>
								</div>
							{{/each}}
						</div>

						{{#if this.fontRows.length}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Fonts</h4>
								<div
									class="dt-preflight-list is-flush"
								>
									{{#each
										this.fontRows
										key="key"
										as |row|
									}}
										<div
											class="dt-preflight-font"
										>
											<span
												class="dt-preflight-font-name"
											>
												{{row.font.name}}
												{{#if
													row.font.type
												}}
													<span
														class="dt-preflight-font-type"
													>({{row.font.type}})</span>
												{{/if}}
											</span>
											<span
												class="dt-preflight-font-state
													{{if
														row.font.embedded
														'is-embedded'
														'is-missing'
													}}"
											>{{row.state}}</span>
											{{#if
												row.font.data
											}}
												<button
													type="button"
													class="dt-preflight-font-download"
													title={{row.downloadTitle}}
													aria-label={{passAlong
														row.downloadTitle
													}}
													{{on
														"click"
														(fn
															this.downloadFont
															row.font
														)
													}}
												>
													<Icon
														@name={{(downloadIcon
														)}}
													/>
												</button>
											{{/if}}
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}

						{{#if
							this.issueCategories.length
						}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Issues by
									Category</h4>
								{{#each
									this.issueCategories
									key="id"
									as |group|
								}}
									<div
										class="dt-preflight-group"
									>
										<h5
											class="dt-preflight-subhead"
										>{{group.label}}</h5>
										<div
											class="dt-preflight-list"
										>
											{{#each
												group.issues
												key="key"
												as |issue|
											}}
												<button
													type="button"
													class="dt-preflight-issue is-row
														{{unless
															issue.page
															'is-static'
														}}"
													{{on
														"click"
														(fn
															this.goToIssuePage
															issue
														)
													}}
												>
													<Icon
														@name={{issue.icon}}
														class="dt-preflight-sev is-{{issue.severity}}"
													/>
													<span
														class="dt-preflight-issue-body"
													>
														<span
															class="dt-preflight-issue-message"
														>{{issue.message}}
															{{#if
																issue.page
															}}
																<span
																	class="dt-preflight-issue-page"
																>p.{{issue.page}}</span>
															{{/if}}
														</span>
														{{#if
															issue.details
														}}
															<span
																class="dt-preflight-issue-details"
															>{{issue.details}}</span>
														{{/if}}
													</span>
												</button>
											{{/each}}
										</div>
									</div>
								{{/each}}
							</div>
						{{/if}}

						{{#if this.issuePages.length}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Issues by Page</h4>
								{{#each
									this.issuePages
									key="page"
									as |entry|
								}}
									<div
										class="dt-preflight-group"
									>
										<button
											type="button"
											class="dt-preflight-page-btn"
											{{on
												"click"
												(fn
													this.goToPage
													entry.page
												)
											}}
										>Page
											{{entry.page}}</button>
										<div
											class="dt-preflight-list"
										>
											{{#each
												entry.issues
												key="key"
												as |issue|
											}}
												<button
													type="button"
													class="dt-preflight-issue is-row is-compact"
													{{on
														"click"
														(fn
															this.goToPage
															entry.page
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
										</div>
									</div>
								{{/each}}
							</div>
						{{/if}}
					</div>

					<a
						class="dt-preflight-taxiway"
						href="https://rmv.fyi/projects/taxiway"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span>Need more?
							<strong>Taxiway</strong>
							is a free native macOS
							app with 55 checks,
							automated fixes, and
							full PDF inspection.</span>
						<Icon @name="external-link" />
					</a>
				</div>
			{{/if}}
		</div>
	</template>
}
