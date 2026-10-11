import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import {
	Canvas,
	Ellipse,
	FabricImage,
	IText,
	Line,
	Path,
	PencilBrush,
	Point,
	Rect,
	util as fabricUtil,
	type FabricObject,
	type TPointerEventInfo,
} from 'fabric';
import {
	contentBox,
	contentPlacement,
	displayedToUnrotated,
	newId,
	pageSize,
	totalRotation,
	unrotatedSize,
	type ErrataDoc,
	type ErrataPage,
	type ImageObject,
	type InkObject,
	type PageCrop,
	type PageObject,
	type ShapeKind,
	type ShapeObject,
	type TextObject,
	applyMatrix,
	type ContentEdit,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	addObject,
	getPageIndex,
	patchObjects,
	removeObjects,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { addContentEdits, cropPage } from 'delphitools-v2/lib/errata/page-ops';
import {
	pageContent,
	type PageContentView,
} from 'delphitools-v2/lib/errata/content';
import type {
	TextLine,
	TextRun,
} from 'delphitools-v2/lib/errata/content/interpret';
import {
	pageFontFace,
	type PageFontFace,
} from 'delphitools-v2/lib/errata/source';
import { winAnsiCode } from 'delphitools-v2/lib/errata/content/fonts';
import { SUBSTITUTE_RES } from 'delphitools-v2/lib/errata/content/rewrite';
import {
	pageKey,
	renderTile,
	type TileJob,
} from 'delphitools-v2/lib/errata/source';
import {
	getActiveTool,
	getToolSettings,
	setActiveTool,
	subscribeTool,
} from 'delphitools-v2/lib/errata/tool';
import { registerCanvasActions } from 'delphitools-v2/lib/errata/ui';
import {
	registerViewportController,
	reportZoom,
} from 'delphitools-v2/lib/substrata/viewport';

// continuous scroll: every page sits in one scene, stacked with GAP between

const FONT = 'Helvetica, Arial, sans-serif';
const ZMIN = 0.1;
const ZMAX = 16;
const FIT_PAD = 24;
// floating tool rail height plus its bottom offset
const RAIL_INSET = 72;
const GAP = 24;
// tiles kept this many viewport heights beyond the visible range
const KEEP_MARGIN = 1.5;
// tiles cover this much beyond the viewport so small scrolls need no render
const TILE_MARGIN = 0.5;
const TILE_DEBOUNCE = 80;
const K_MIN = 0.5;
const K_MAX = 40;

// half-octave buckets keep zoom wobble from re-rendering
function bucket(k: number): number {
	const clamped = Math.max(K_MIN, Math.min(K_MAX, k));
	return Math.pow(2, Math.round(Math.log2(clamped) * 2) / 2);
}

function fmtPt(n: number): string {
	return (Math.round(n * 10) / 10).toString();
}

function contains(outer: PageCrop, inner: PageCrop): boolean {
	return (
		outer.x <= inner.x + 0.5 &&
		outer.y <= inner.y + 0.5 &&
		outer.x + outer.width >= inner.x + inner.width - 0.5 &&
		outer.y + outer.height >= inner.y + inner.height - 0.5
	);
}

interface Tracked {
	fabric: FabricObject;
	doc: PageObject;
	pageId: string;
}

interface Tile {
	k: number;
	rect: PageCrop;
	img: FabricObject;
	/** page content changed; keep showing this until the replacement arrives */
	stale?: boolean;
}

interface Slot {
	id: string;
	key: string;
	x: number;
	y: number;
	width: number;
	height: number;
	bg: FabricObject;
	tile: Tile | null;
	job: TileJob | null;
}

function centreProps(o: PageObject, slot: Slot) {
	return {
		left: slot.x + o.cx,
		top: slot.y + o.cy,
		originX: 'center' as const,
		originY: 'center' as const,
		angle: o.angle,
		scaleX: o.scaleX,
		scaleY: o.scaleY,
	};
}

function opacityOf(o: PageObject): number {
	return o.kind === 'text' ? (o.opacity ?? 1) : 1;
}

function needsRebuild(prev: PageObject, next: PageObject): boolean {
	if (prev.kind !== next.kind) return true;
	if (next.kind === 'ink') return (prev as InkObject).d !== next.d;
	if (next.kind === 'shape')
		return (prev as ShapeObject).shape !== next.shape;
	if (next.kind === 'image')
		return (prev as ImageObject).dataUrl !== next.dataUrl;
	return false;
}

function localPathD(
	path: Pick<Path, 'path' | 'pathOffset' | 'width' | 'height'>,
): string {
	const ox = path.pathOffset.x - path.width / 2;
	const oy = path.pathOffset.y - path.height / 2;
	return fabricUtil.joinPath(
		fabricUtil.transformPath(
			path.path,
			[1, 0, 0, 1, -ox, -oy],
			new Point(0, 0),
		),
		2,
	);
}

// fabric 7 defaults to a centre origin
function placeholder(slot: Pick<Slot, 'x' | 'y' | 'width' | 'height'>) {
	return new Rect({
		left: slot.x,
		top: slot.y,
		originX: 'left',
		originY: 'top',
		width: slot.width,
		height: slot.height,
		fill: '#fff',
		selectable: false,
		evented: false,
		hoverCursor: 'default',
	});
}

export default class PageCanvas extends Component {
	mount = modifier((wrap: HTMLDivElement) => {
		const el = wrap.querySelector('canvas');
		if (!el) return;

		const canvas = new Canvas(el, {
			selection: true,
			preserveObjectStacking: true,
			controlsAboveOverlay: true,
		});
		const brush = new PencilBrush(canvas);
		canvas.freeDrawingBrush = brush;

		const tracked = new Map<string, Tracked>();
		let pendingSelect: string | null = null;
		const images = new Map<string, HTMLImageElement | 'loading'>();
		const slots = new Map<string, Slot>();
		let order: string[] = [];
		let sceneWidth = 0;
		let sceneHeight = 0;
		let fitPending = true;
		// page index this canvas last derived from the scroll position
		let derivedIndex = -1;
		let programmatic = false;
		let visibleRaf = 0;

		const slotOf = (id: string) => slots.get(id);
		const slotAt = (index: number) => slots.get(order[index] ?? '');

		// page under a scene point, else the nearest by y
		const pageAt = (p: Point): Slot | null => {
			let best: Slot | null = null;
			let bestDist = Infinity;
			for (const id of order) {
				const s = slotOf(id)!;
				if (
					p.x >= s.x &&
					p.x <= s.x + s.width &&
					p.y >= s.y &&
					p.y <= s.y + s.height
				)
					return s;
				const dist =
					p.y < s.y
						? s.y - p.y
						: p.y - (s.y + s.height);
				if (dist < bestDist) {
					bestDist = dist;
					best = s;
				}
			}
			return best;
		};

		const clampViewport = () => {
			const vpt =
				canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
			const z = vpt[0];
			const W = canvas.getWidth();
			const H = canvas.getHeight();
			const cw = sceneWidth * z;
			const ch = sceneHeight * z;
			vpt[4] =
				cw + FIT_PAD * 2 <= W
					? (W - cw) / 2
					: Math.min(
							FIT_PAD,
							Math.max(
								W -
									cw -
									FIT_PAD,
								vpt[4],
							),
						);
			vpt[5] =
				ch + FIT_PAD * 2 <= H
					? (H - ch) / 2
					: Math.min(
							FIT_PAD,
							Math.max(
								H -
									ch -
									FIT_PAD,
								vpt[5],
							),
						);
			canvas.setViewportTransform(vpt);
		};

		const fitPage = (index: number) => {
			const slot = slotAt(index);
			if (!slot) return;
			const w = Math.max(1, canvas.getWidth() - FIT_PAD * 2);
			const h = Math.max(
				1,
				canvas.getHeight() - FIT_PAD * 2 - RAIL_INSET,
			);
			const z = Math.min(
				w / slot.width,
				h / slot.height,
				ZMAX,
			);
			canvas.setViewportTransform([
				z,
				0,
				0,
				z,
				FIT_PAD + (w - slot.width * z) / 2 - slot.x * z,
				FIT_PAD - slot.y * z,
			]);
			clampViewport();
			reportZoom(z);
		};

		const scrollToPage = (index: number) => {
			const slot = slotAt(index);
			if (!slot) return;
			const vpt =
				canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
			vpt[5] = FIT_PAD - (slot.y - GAP / 2) * vpt[0];
			canvas.setViewportTransform(vpt);
			clampViewport();
			canvas.requestRenderAll();
		};

		// scene y range on screen
		const visibleRange = () => {
			const vpt = canvas.viewportTransform;
			const z = vpt[0];
			const top = -vpt[5] / z;
			return { top, bottom: top + canvas.getHeight() / z };
		};

		const dropTile = (slot: Slot) => {
			slot.job?.cancel();
			slot.job = null;
			if (slot.tile) canvas.remove(slot.tile.img);
			slot.tile = null;
		};

		const setTile = (slot: Slot, tile: Tile) => {
			if (slot.tile) canvas.remove(slot.tile.img);
			slot.tile = tile;
			const at = canvas.getObjects().indexOf(slot.bg);
			canvas.insertAt(at + 1, tile.img);
			canvas.requestRenderAll();
		};

		const updateVisible = () => {
			visibleRaf = 0;
			const doc = store.getSnapshot();
			if (!doc || order.length === 0) return;
			const { top, bottom } = visibleRange();
			const margin = (bottom - top) * KEEP_MARGIN;
			let best = -1;
			let bestOverlap = 0;
			order.forEach((id, index) => {
				const slot = slotOf(id)!;
				const near =
					slot.y + slot.height > top - margin &&
					slot.y < bottom + margin;
				const overlap =
					Math.min(slot.y + slot.height, bottom) -
					Math.max(slot.y, top);
				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					best = index;
				}
				if (!near && (slot.tile || slot.job))
					dropTile(slot);
			});
			scheduleTiles();
			// a programmatic scroll keeps the index it was asked for
			if (programmatic) {
				programmatic = false;
				return;
			}
			if (best !== -1 && best !== derivedIndex) {
				derivedIndex = best;
				setPageIndex(best);
			}
		};

		// re-render visible page regions at the current zoom
		let tileTimer = 0;
		const scheduleTiles = () => {
			if (tileTimer) clearTimeout(tileTimer);
			tileTimer = window.setTimeout(
				renderTiles,
				TILE_DEBOUNCE,
			);
		};

		const renderTiles = () => {
			tileTimer = 0;
			const doc = store.getSnapshot();
			if (!doc || order.length === 0) return;
			const vpt = canvas.viewportTransform;
			const z = vpt[0];
			const k = bucket(z * (window.devicePixelRatio || 1));
			const viewW = canvas.getWidth() / z;
			const viewH = canvas.getHeight() / z;
			const left = -vpt[4] / z - viewW * TILE_MARGIN;
			const top = -vpt[5] / z - viewH * TILE_MARGIN;
			const right = left + viewW * (1 + 2 * TILE_MARGIN);
			const bottom = top + viewH * (1 + 2 * TILE_MARGIN);
			order.forEach((id, index) => {
				const slot = slotOf(id)!;
				const page = doc.pages[index]!;
				const x1 = Math.max(slot.x, left);
				const y1 = Math.max(slot.y, top);
				const x2 = Math.min(slot.x + slot.width, right);
				const y2 = Math.min(
					slot.y + slot.height,
					bottom,
				);
				if (x2 <= x1 || y2 <= y1) return;
				const needed: PageCrop = {
					x: Math.floor(x1 - slot.x),
					y: Math.floor(y1 - slot.y),
					width: Math.ceil(x2 - x1) + 1,
					height: Math.ceil(y2 - y1) + 1,
				};
				if (
					slot.tile &&
					!slot.tile.stale &&
					slot.tile.k === k &&
					contains(slot.tile.rect, needed)
				)
					return;
				slot.job?.cancel();
				const job = renderTile(page, needed, k);
				slot.job = job;
				const key = slot.key;
				void job.promise.then(
					(raster) => {
						const current = slotOf(id);
						if (
							!current ||
							current.key !== key ||
							current.job !== job
						)
							return;
						current.job = null;
						setTile(current, {
							k,
							rect: needed,
							img: new FabricImage(
								raster,
								{
									left:
										current.x +
										needed.x,
									top:
										current.y +
										needed.y,
									originX: 'left',
									originY: 'top',
									scaleX:
										1 /
										k,
									scaleY:
										1 /
										k,
									selectable: false,
									evented: false,
									hoverCursor:
										'default',
								},
							),
						});
					},
					() => {
						// cancelled or failed render keeps the old tile
					},
				);
			});
			refreshProxies();
		};

		const scheduleVisible = () => {
			if (visibleRaf) return;
			visibleRaf = requestAnimationFrame(updateVisible);
		};

		const size = () => {
			canvas.setDimensions({
				width: wrap.clientWidth,
				height: wrap.clientHeight,
			});
			if (fitPending && order.length) {
				fitPage(getPageIndex());
				fitPending = false;
			} else clampViewport();
			scheduleVisible();
		};
		const ro = new ResizeObserver(size);
		ro.observe(wrap);
		size();

		const build = (
			o: PageObject,
			slot: Slot,
		): FabricObject | null => {
			const base = centreProps(o, slot);
			switch (o.kind) {
				case 'text':
					return new IText(o.text, {
						...base,
						fontFamily: FONT,
						fontSize: o.fontSize,
						fill: o.colour,
					});
				case 'ink':
					return new Path(o.d, {
						...base,
						stroke: o.colour,
						strokeWidth: o.strokeWidth,
						strokeLineCap: 'round',
						strokeLineJoin: 'round',
						fill: '',
					});
				case 'shape':
					if (o.shape === 'ellipse')
						return new Ellipse({
							...base,
							rx: o.w / 2,
							ry: o.h / 2,
							fill: '',
							stroke: o.colour,
							strokeWidth:
								o.strokeWidth,
						});
					if (o.shape === 'line')
						return new Line(
							[0, 0, o.w, 0],
							{
								...base,
								stroke: o.colour,
								strokeWidth:
									o.strokeWidth,
								strokeLineCap:
									'round',
								padding: 6,
							},
						);
					if (o.shape === 'highlight')
						return new Rect({
							...base,
							width: o.w,
							height: o.h,
							fill: o.colour,
							opacity: 0.4,
							globalCompositeOperation:
								'multiply',
						});
					return new Rect({
						...base,
						width: o.w,
						height: o.h,
						fill: '',
						stroke: o.colour,
						strokeWidth: o.strokeWidth,
					});
				case 'image': {
					const img = images.get(o.dataUrl);
					if (!img || img === 'loading') {
						if (!img) {
							images.set(
								o.dataUrl,
								'loading',
							);
							void fabricUtil
								.loadImage(
									o.dataUrl,
								)
								.then(
									(
										loaded,
									) => {
										images.set(
											o.dataUrl,
											loaded,
										);
										sync();
									},
								);
						}
						return null;
					}
					return new FabricImage(img, {
						...base,
						scaleX:
							(o.w /
								img.naturalWidth) *
							o.scaleX,
						scaleY:
							(o.h /
								img.naturalHeight) *
							o.scaleY,
					});
				}
			}
		};

		const apply = (f: FabricObject, o: PageObject, slot: Slot) => {
			const base = centreProps(o, slot);
			if (o.kind === 'image' && f instanceof FabricImage) {
				f.set({
					...base,
					scaleX: (o.w / f.width) * o.scaleX,
					scaleY: (o.h / f.height) * o.scaleY,
				});
			} else if (o.kind === 'text') {
				f.set({
					...base,
					text: o.text,
					fontSize: o.fontSize,
					fill: o.colour,
				});
			} else if (o.kind === 'ink') {
				f.set({
					...base,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			} else if (o.kind !== 'shape') {
				f.set(base);
			} else if (o.shape === 'highlight') {
				f.set({
					...base,
					width: o.w,
					height: o.h,
					fill: o.colour,
				});
			} else if (o.shape === 'ellipse') {
				f.set({
					...base,
					rx: o.w / 2,
					ry: o.h / 2,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			} else {
				f.set({
					...base,
					width: o.w,
					height: o.h,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			}
			f.setCoords();
		};

		const layout = (doc: ErrataDoc) => {
			sceneWidth = Math.max(
				1,
				...doc.pages.map((p) => pageSize(p).width),
			);
			let y = 0;
			const seen = new Set<string>();
			order = doc.pages.map((page) => {
				const { width, height } = pageSize(page);
				const key = pageKey(page);
				const x = (sceneWidth - width) / 2;
				let slot = slots.get(page.id);
				if (slot && slot.key !== key) {
					if (
						slot.width === width &&
						slot.height === height
					) {
						slot.key = key;
						if (slot.tile)
							slot.tile.stale = true;
					} else {
						dropTile(slot);
						canvas.remove(slot.bg);
						slots.delete(page.id);
						slot = undefined;
					}
				}
				if (!slot) {
					const bg = placeholder({
						x,
						y,
						width,
						height,
					});
					canvas.add(bg);
					slot = {
						id: page.id,
						key,
						x,
						y,
						width,
						height,
						bg,
						tile: null,
						job: null,
					};
					slots.set(page.id, slot);
				} else if (slot.x !== x || slot.y !== y) {
					slot.x = x;
					slot.y = y;
					slot.bg.set({ left: x, top: y });
					slot.bg.setCoords();
					if (slot.tile) {
						slot.tile.img.set({
							left:
								x +
								slot.tile.rect
									.x,
							top:
								y +
								slot.tile.rect
									.y,
						});
						slot.tile.img.setCoords();
					}
				}
				seen.add(page.id);
				y += height + GAP;
				return page.id;
			});
			for (const [id, slot] of slots) {
				if (seen.has(id)) continue;
				dropTile(slot);
				canvas.remove(slot.bg);
				slots.delete(id);
			}
			sceneHeight = Math.max(1, y - GAP);
		};

		const sync = () => {
			const doc = store.getSnapshot();
			if (!doc) {
				for (const slot of slots.values())
					dropTile(slot);
				canvas.clear();
				tracked.clear();
				slots.clear();
				order = [];
				derivedIndex = -1;
				fitPending = true;
				return;
			}
			const firstLoad = order.length === 0;
			layout(doc);

			const seen = new Set<string>();
			for (const page of doc.pages) {
				const slot = slotOf(page.id)!;
				for (const o of page.objects) {
					seen.add(o.id);
					const t = tracked.get(o.id);
					if (
						t &&
						t.doc === o &&
						t.pageId === page.id
					) {
						// keep it pinned to a moved page
						const base = centreProps(
							o,
							slot,
						);
						if (
							t.fabric.left !==
								base.left ||
							t.fabric.top !==
								base.top
						) {
							t.fabric.set({
								left: base.left,
								top: base.top,
							});
							t.fabric.setCoords();
						}
						continue;
					}
					if (t && !needsRebuild(t.doc, o)) {
						apply(t.fabric, o, slot);
						t.doc = o;
						t.pageId = page.id;
						dimOutside(t.fabric);
						continue;
					}
					if (t) {
						canvas.remove(t.fabric);
						tracked.delete(o.id);
					}
					const f = build(o, slot);
					if (!f) continue;
					attach(f);
					canvas.add(f);
					tracked.set(o.id, {
						fabric: f,
						doc: o,
						pageId: page.id,
					});
					dimOutside(f);
					if (pendingSelect === o.id) {
						pendingSelect = null;
						canvas.setActiveObject(f);
					}
				}
			}
			for (const [id, t] of tracked) {
				if (seen.has(id)) continue;
				canvas.remove(t.fabric);
				tracked.delete(id);
			}
			// z-order: page backgrounds and tiles, then objects in doc order
			let index = 0;
			for (const id of order) {
				const slot = slotOf(id)!;
				canvas.moveObjectTo(slot.bg, index++);
				if (slot.tile)
					canvas.moveObjectTo(
						slot.tile.img,
						index++,
					);
			}
			for (const page of doc.pages)
				for (const o of page.objects) {
					const t = tracked.get(o.id);
					if (t)
						canvas.moveObjectTo(
							t.fabric,
							index++,
						);
				}

			if (fitPending || firstLoad) {
				derivedIndex = getPageIndex();
				fitPage(derivedIndex);
				fitPending = false;
			} else clampViewport();
			applyTool();
			// doc edits never move the current page; only user scrolling does
			programmatic = true;
			scheduleVisible();
			canvas.requestRenderAll();
		};

		const idOf = (f: FabricObject): string | null => {
			for (const [id, t] of tracked)
				if (t.fabric === f) return id;
			return null;
		};

		// the export clips to the page. An object hanging over the edge is hidden from the
		// main pass and drawn twice in after:render: the part on the page as is, the rest dimmed
		const OUTSIDE_OPACITY = 0.4;
		const overhanging = new Set<FabricObject>();
		const placed = (f: FabricObject) => {
			const id = idOf(f);
			const t = id ? tracked.get(id) : null;
			const slot = t && slotOf(t.pageId);
			return t && slot
				? { slot, opacity: opacityOf(t.doc) }
				: null;
		};
		const dimOutside = (f: FabricObject) => {
			const p = placed(f);
			if (!p) return;
			const { slot } = p;
			const b = f.getBoundingRect();
			const outside =
				b.left < slot.x - 0.5 ||
				b.top < slot.y - 0.5 ||
				b.left + b.width > slot.x + slot.width + 0.5 ||
				b.top + b.height > slot.y + slot.height + 0.5;
			if (outside) overhanging.add(f);
			else overhanging.delete(f);
			const opacity = outside ? 0 : p.opacity;
			if (f.opacity !== opacity) f.set({ opacity });
		};
		const dimActive = () => {
			for (const f of canvas.getActiveObjects())
				dimOutside(f);
		};
		canvas.on('object:moving', dimActive);
		canvas.on('object:scaling', dimActive);
		canvas.on('object:rotating', dimActive);
		canvas.on('after:render', () => {
			if (overhanging.size === 0) return;
			const ctx = canvas.getContext();
			const vpt = canvas.viewportTransform;
			for (const f of overhanging) {
				const p = placed(f);
				if (!p || !canvas.contains(f)) {
					overhanging.delete(f);
					continue;
				}
				const { slot, opacity } = p;
				for (const [alpha, evenodd] of [
					[1, false],
					[OUTSIDE_OPACITY, true],
				] as const) {
					ctx.save();
					ctx.transform(...vpt);
					ctx.beginPath();
					if (evenodd)
						ctx.rect(-1e6, -1e6, 2e6, 2e6);
					ctx.rect(
						slot.x,
						slot.y,
						slot.width,
						slot.height,
					);
					ctx.clip(
						evenodd ? 'evenodd' : 'nonzero',
					);
					// direct assignment: set() would mark the object dirty on every frame
					f.opacity = alpha * opacity;
					f.render(ctx);
					f.opacity = 0;
					ctx.restore();
				}
			}
		});

		const attach = (f: FabricObject) => {
			if (f instanceof IText) {
				f.on('editing:exited', () => {
					const id = idOf(f);
					const t = id ? tracked.get(id) : null;
					if (!id || !t) return;
					if (f.text.trim() === '') {
						removeObjects(t.pageId, [id]);
						return;
					}
					patchObjects(
						t.pageId,
						new Map([
							[
								id,
								{
									text: f.text,
									w: f.width,
									h: f.height,
								},
							],
						]),
					);
				});
			}
		};

		canvas.on('object:modified', (e) => {
			const targets =
				e.target && e.target.type === 'activeselection'
					? (
							e.target as unknown as {
								getObjects(): FabricObject[];
							}
						).getObjects()
					: e.target
						? [e.target]
						: [];
			if (commitProxyEdits(targets, moveEdits)) return;
			const byPage = new Map<
				string,
				Map<string, Partial<PageObject>>
			>();
			for (const f of targets) {
				const id = idOf(f);
				const t = id ? tracked.get(id) : null;
				const slot = t ? slotOf(t.pageId) : null;
				if (!id || !t || !slot) continue;
				const d = fabricUtil.qrDecompose(
					f.calcTransformMatrix(),
				);
				const patch: Partial<PageObject> = {
					cx: d.translateX - slot.x,
					cy: d.translateY - slot.y,
					angle: d.angle,
					scaleX: d.scaleX,
					scaleY: d.scaleY,
				};
				if (t.doc.kind === 'image') {
					patch.scaleX =
						(d.scaleX * f.width) / t.doc.w;
					patch.scaleY =
						(d.scaleY * f.height) / t.doc.h;
				}
				let patches = byPage.get(t.pageId);
				if (!patches) {
					patches = new Map();
					byPage.set(t.pageId, patches);
				}
				patches.set(id, patch);
			}
			for (const [pageId, patches] of byPage)
				patchObjects(pageId, patches);
		});

		canvas.on('path:created', ({ path }) => {
			canvas.remove(path);
			if (!(path instanceof Path)) return;
			const centre = new Point(
				path.left + path.width / 2,
				path.top + path.height / 2,
			);
			const slot = pageAt(centre);
			if (!slot) return;
			const settings = getToolSettings();
			const ink: InkObject = {
				id: newId(),
				kind: 'ink',
				cx: centre.x - slot.x,
				cy: centre.y - slot.y,
				w: path.width,
				h: path.height,
				scaleX: 1,
				scaleY: 1,
				angle: 0,
				d: localPathD(path),
				colour: settings.colour,
				strokeWidth: settings.strokeWidth,
			};
			addObject(slot.id, ink);
		});

		// drag-to-draw shapes and crop, in the page under the drag start
		let dragStart: Point | null = null;
		let dragSlot: Slot | null = null;
		let ghost: FabricObject | null = null;

		const shapeGeometry = (a: Point, b: Point) => {
			const tool = getActiveTool();
			const s = getToolSettings();
			const shape: ShapeKind =
				tool === 'highlight' ? 'highlight' : s.shape;
			if (shape === 'line') {
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				return {
					shape,
					cx: (a.x + b.x) / 2,
					cy: (a.y + b.y) / 2,
					w: Math.hypot(dx, dy),
					h: 0,
					angle:
						(Math.atan2(dy, dx) * 180) /
						Math.PI,
				};
			}
			return {
				shape,
				cx: (a.x + b.x) / 2,
				cy: (a.y + b.y) / 2,
				w: Math.abs(b.x - a.x),
				h: Math.abs(b.y - a.y),
				angle: 0,
			};
		};

		// scene points in, page-local object out
		const shapeObject = (
			slot: Slot,
			a: Point,
			b: Point,
		): ShapeObject => {
			const s = getToolSettings();
			const g = shapeGeometry(a, b);
			return {
				id: newId(),
				kind: 'shape',
				...g,
				cx: g.cx - slot.x,
				cy: g.cy - slot.y,
				scaleX: 1,
				scaleY: 1,
				colour:
					g.shape === 'highlight'
						? s.highlightColour
						: s.colour,
				strokeWidth: s.strokeWidth,
			};
		};

		// displayed drag rect to a crop in source box coordinates
		const cropFromDrag = (
			page: ErrataPage,
			slot: Slot,
			a: Point,
			b: Point,
		) => {
			const r = totalRotation(page);
			const u = unrotatedSize(page);
			const c = contentBox(page);
			const p = contentPlacement(page);
			const local = (v: Point) =>
				displayedToUnrotated(
					v.x - slot.x,
					v.y - slot.y,
					r,
					u.width,
					u.height,
				);
			const toSource = (v: { x: number; y: number }) => ({
				x: c.x + (v.x - p.x) / p.scale,
				y: c.y + (v.y - p.y) / p.scale,
			});
			const sa = toSource(local(a));
			const sb = toSource(local(b));
			const x1 = Math.max(0, Math.min(sa.x, sb.x));
			const y1 = Math.max(0, Math.min(sa.y, sb.y));
			const x2 = Math.min(
				page.baseWidth,
				Math.max(sa.x, sb.x),
			);
			const y2 = Math.min(
				page.baseHeight,
				Math.max(sa.y, sb.y),
			);
			if (x2 - x1 < 4 || y2 - y1 < 4) return null;
			return {
				x: x1,
				y: y1,
				width: x2 - x1,
				height: y2 - y1,
			};
		};

		const cropGhost = (a: Point, b: Point) =>
			new Rect({
				left: (a.x + b.x) / 2,
				top: (a.y + b.y) / 2,
				originX: 'center',
				originY: 'center',
				width: Math.abs(b.x - a.x),
				height: Math.abs(b.y - a.y),
				fill: 'rgba(0,0,0,0.04)',
				stroke: '#000',
				strokeWidth: 1,
				strokeUniform: true,
				strokeDashArray: [4, 4],
			});

		canvas.on('mouse:down', (opt: TPointerEventInfo) => {
			const tool = getActiveTool();
			if (order.length === 0) return;
			// own double-click detection: pointer events carry no click count and fabric's dblclick is unreliable here
			if (tool === 'content') {
				const t = opt.target;
				const now = performance.now();
				if (
					t &&
					proxyInfo.get(t)?.line &&
					lastPress.target === t &&
					now - lastPress.at < 400
				)
					pendingEdit = t;
				lastPress = { target: t ?? null, at: now };
				return;
			}
			if (tool === 'text') {
				if (opt.target instanceof IText) return;
				const p = canvas.getScenePoint(opt.e);
				const slot = pageAt(p);
				if (!slot) return;
				const s = getToolSettings();
				const text: TextObject = {
					id: newId(),
					kind: 'text',
					cx: p.x - slot.x,
					cy: p.y - slot.y,
					w: 0,
					h: 0,
					scaleX: 1,
					scaleY: 1,
					angle: 0,
					text: '',
					fontSize: s.fontSize,
					colour: s.colour,
				};
				addObject(slot.id, text);
				const f = tracked.get(text.id)?.fabric;
				if (f instanceof IText) {
					canvas.setActiveObject(f);
					f.enterEditing();
				}
				return;
			}
			if (
				tool === 'shape' ||
				tool === 'highlight' ||
				tool === 'crop'
			) {
				dragStart = canvas.getScenePoint(opt.e);
				dragSlot = pageAt(dragStart);
			}
		});

		canvas.on('mouse:move', (opt: TPointerEventInfo) => {
			if (!dragStart || !dragSlot) return;
			const p = canvas.getScenePoint(opt.e);
			if (ghost) canvas.remove(ghost);
			ghost =
				getActiveTool() === 'crop'
					? cropGhost(dragStart, p)
					: build(
							shapeObject(
								dragSlot,
								dragStart,
								p,
							),
							dragSlot,
						);
			if (ghost) {
				ghost.selectable = false;
				ghost.evented = false;
				canvas.add(ghost);
			}
			canvas.requestRenderAll();
		});

		canvas.on('mouse:up', (opt: TPointerEventInfo) => {
			if (pendingEdit) {
				// after fabric has finished its own selection handling for this click
				const t = pendingEdit;
				pendingEdit = null;
				setTimeout(() => void startTextEdit(t), 0);
				return;
			}
			if (!dragStart || !dragSlot) return;
			const p = canvas.getScenePoint(opt.e);
			const start = dragStart;
			const slot = dragSlot;
			dragStart = null;
			dragSlot = null;
			if (ghost) canvas.remove(ghost);
			ghost = null;
			if (getActiveTool() === 'crop') {
				const page = store
					.getSnapshot()
					?.pages.find((pg) => pg.id === slot.id);
				const crop = page
					? cropFromDrag(page, slot, start, p)
					: null;
				if (page && crop) {
					cropPage(page.id, crop);
					setActiveTool('select');
				} else canvas.requestRenderAll();
				return;
			}
			const o = shapeObject(slot, start, p);
			if (o.w < 2 && o.h < 2) {
				canvas.requestRenderAll();
				return;
			}
			addObject(slot.id, o);
		});

		// content tool: one transparent, draggable rect per line, image, path or form of the source page
		interface ProxyInfo {
			pageId: string;
			ranges: { stream: string; from: number; to: number }[];
			left: number;
			top: number;
			view: PageContentView;
			kind: 'Text' | 'Image' | 'Path' | 'Form';
			detail: string;
			/** points */
			width: number;
			height: number;
			line?: TextLine;
		}
		const proxyInfo = new WeakMap<FabricObject, ProxyInfo>();
		const KIND_LABEL = {
			image: 'Image',
			path: 'Path',
			form: 'Form',
		} as const;
		const fontLabel = (run: TextRun) =>
			`${run.font.baseFont.replace(/^[A-Z]{6}\+/, '') || run.font.subtype} ${fmtPt(run.fontSize)}`;
		// the moved object is selected again once its page's proxies are rebuilt
		let reselect: {
			pageId: string;
			left: number;
			top: number;
		} | null = null;
		const proxies = new Map<
			string,
			{ key: string; rects: FabricObject[] }
		>();
		// the page raster is white in both themes, so the outline colour is fixed
		const ACCENT = '#1f6feb';

		const dropProxies = (pageId: string) => {
			const p = proxies.get(pageId);
			if (!p) return;
			for (const r of p.rects) canvas.remove(r);
			proxies.delete(pageId);
		};

		const proxyRect = (
			slot: Slot,
			view: PageContentView,
			pageId: string,
			box: {
				x: number;
				y: number;
				width: number;
				height: number;
			},
			ranges: ProxyInfo['ranges'],
			kind: ProxyInfo['kind'],
			detail = '',
			line?: TextLine,
		): FabricObject => {
			const r = new Rect({
				left: slot.x + box.x,
				top: slot.y + box.y,
				originX: 'left',
				originY: 'top',
				width: Math.max(box.width, 1),
				height: Math.max(box.height, 1),
				fill: 'rgba(0,0,0,0)',
				stroke: undefined,
				strokeWidth: 1,
				strokeUniform: true,
				hasControls: false,
				lockRotation: true,
				lockScalingX: true,
				lockScalingY: true,
				borderColor: ACCENT,
				padding: 1,
				hoverCursor: 'move',
			});
			proxyInfo.set(r, {
				pageId,
				ranges,
				left: r.left,
				top: r.top,
				view,
				kind,
				detail,
				width: box.width,
				height: box.height,
				line,
			});
			return r;
		};

		const refreshProxies = () => {
			const doc = store.getSnapshot();
			if (getActiveTool() !== 'content' || !doc) {
				for (const id of [...proxies.keys()])
					dropProxies(id);
				return;
			}
			const { top, bottom } = visibleRange();
			const margin = (bottom - top) * KEEP_MARGIN;
			const wanted = new Set<string>();
			doc.pages.forEach((page) => {
				const slot = slotOf(page.id);
				if (!slot || page.sourceIndex === null) return;
				const near =
					slot.y + slot.height > top - margin &&
					slot.y < bottom + margin;
				if (!near) return;
				wanted.add(page.id);
				const key = `${slot.key}:${slot.x}:${slot.y}`;
				const old = proxies.get(page.id);
				if (old?.key === key) return;
				proxies.set(page.id, {
					key,
					rects: old?.rects ?? [],
				});
				void pageContent(page).then((view) => {
					const current = proxies.get(page.id);
					if (
						!view ||
						!current ||
						current.key !== key ||
						getActiveTool() !== 'content'
					)
						return;
					const rects: FabricObject[] = [];
					for (const line of view.lines) {
						if (!line.text.trim()) continue;
						rects.push(
							proxyRect(
								slot,
								view,
								page.id,
								view.toDisplayed(
									line.bbox,
								),
								line.runs.map(
									(
										r,
									) => ({
										stream: r.stream,
										from: r.from,
										to: r.to,
									}),
								),
								'Text',
								fontLabel(
									line
										.runs[0]!,
								),
								line,
							),
						);
					}
					for (const it of view.content.items) {
						if (it.kind === 'text')
							continue;
						const b = view.toDisplayed(
							it.bbox,
						);
						if (b.width < 1 && b.height < 1)
							continue;
						rects.push(
							proxyRect(
								slot,
								view,
								page.id,
								b,
								[
									{
										stream: it.stream,
										from: it.from,
										to: it.to,
									},
								],
								KIND_LABEL[
									it.kind
								],
							),
						);
					}
					for (const r of current.rects)
						canvas.remove(r);
					for (const r of rects) canvas.add(r);
					current.rects = rects;
					if (reselect?.pageId === page.id) {
						const { left, top } = reselect;
						reselect = null;
						// a substituted font changes the line's ascent, so the top may move by a few points
						const again = rects
							.map((r) => ({
								r,
								d:
									Math.abs(
										r.left -
											left,
									) +
									Math.abs(
										r.top -
											top,
									),
							}))
							.filter((c) => c.d < 12)
							.sort(
								(a, b) =>
									a.d -
									b.d,
							)[0]?.r;
						if (again)
							canvas.setActiveObject(
								again,
							);
					}
					canvas.requestRenderAll();
				});
			});
			for (const id of [...proxies.keys()])
				if (!wanted.has(id)) dropProxies(id);
		};

		// hud: kind, font and size of the hovered or selected proxy
		const hud = wrap.querySelector<HTMLElement>('.err-hud')!;
		let hudTarget: FabricObject | null = null;
		const placeHud = () => {
			const t = hudTarget;
			if (!t || !canvas.contains(t)) {
				hud.hidden = true;
				return;
			}
			// fabric 7 bounding rects are scene coordinates; the hud is positioned in canvas pixels
			const vpt = canvas.viewportTransform;
			const corners = t
				.getCoords()
				.map((p) => fabricUtil.transformPoint(p, vpt));
			const left = Math.min(...corners.map((p) => p.x));
			const top = Math.min(...corners.map((p) => p.y));
			const bottom = Math.max(...corners.map((p) => p.y));
			const below = top < 36;
			hud.style.left = `${Math.max(0, left)}px`;
			hud.style.top = `${below ? bottom + 6 : top}px`;
			hud.classList.toggle('is-below', below);
			hud.hidden = false;
		};
		const chip = (text: string, cls = 'err-hud-kind') => {
			const el = document.createElement('span');
			el.className = cls;
			el.textContent = text;
			return el;
		};
		const showHud = (t: FabricObject | null) => {
			hudTarget = t;
			const info = t ? proxyInfo.get(t) : null;
			if (!info) {
				hud.classList.remove('is-warn');
				const n = canvas.getActiveObjects().length;
				if (t && n > 1) {
					hud.replaceChildren(
						chip(`${n} objects`),
					);
					placeHud();
				} else hud.hidden = true;
				return;
			}
			const substituted =
				info.line?.runs[0]?.fontRes === SUBSTITUTE_RES;
			hud.classList.toggle('is-warn', substituted);
			hud.replaceChildren(
				chip(
					info.detail
						? `${info.kind} · ${info.detail}`
						: info.kind,
				),
				chip(
					`${fmtPt(info.width)} × ${fmtPt(info.height)} pt`,
					'err-hud-dims',
				),
				...(substituted
					? [chip('Font unavailable')]
					: []),
			);
			placeHud();
		};
		const activeProxy = () => {
			const a = canvas.getActiveObject();
			return a &&
				(proxyInfo.has(a) ||
					a.type === 'activeselection')
				? a
				: null;
		};

		canvas.on('mouse:over', (e) => {
			const t = e.target;
			if (t && proxyInfo.has(t)) {
				t.set({ stroke: ACCENT });
				if (!activeProxy()) showHud(t);
				canvas.requestRenderAll();
			}
		});
		canvas.on('mouse:out', (e) => {
			const t = e.target;
			if (t && proxyInfo.has(t)) {
				t.set({ stroke: undefined });
				showHud(activeProxy());
				canvas.requestRenderAll();
			}
		});
		canvas.on('selection:created', () => showHud(activeProxy()));
		canvas.on('selection:updated', () => showHud(activeProxy()));
		canvas.on('selection:cleared', () => showHud(null));
		canvas.on('after:render', placeHud);

		// later op indices first, so earlier ranges stay valid while the edits replay
		const orderEdits = (edits: ContentEdit[]) =>
			edits
				.slice()
				.sort(
					(a, b) =>
						a.stream.localeCompare(
							b.stream,
						) || b.from - a.from,
				);

		const commitProxyEdits = (
			targets: FabricObject[],
			make: (
				info: ProxyInfo,
				f: FabricObject,
			) => ContentEdit[],
		): boolean => {
			const byPage = new Map<string, ContentEdit[]>();
			for (const f of targets) {
				const info = proxyInfo.get(f);
				if (!info) continue;
				byPage.set(info.pageId, [
					...(byPage.get(info.pageId) ?? []),
					...make(info, f),
				]);
			}
			if (byPage.size === 0) return false;
			// fabric fires object:modified while finalising the transform; removing the
			// active object inside that call recurses through discardActiveObject
			queueMicrotask(() => {
				canvas.discardActiveObject();
				for (const [pageId, edits] of byPage)
					addContentEdits(
						pageId,
						orderEdits(edits),
					);
			});
			return true;
		};

		const moveEdits = (
			info: ProxyInfo,
			f: FabricObject,
		): ContentEdit[] => {
			const d = fabricUtil.qrDecompose(
				f.calcTransformMatrix(),
			);
			reselect = {
				pageId: info.pageId,
				left: d.translateX - f.width / 2,
				top: d.translateY - f.height / 2,
			};
			// qrDecompose gives the centre; compare against the rect's own centre at build time
			const dx = d.translateX - (info.left + f.width / 2);
			const dy = d.translateY - (info.top + f.height / 2);
			if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05)
				return [];
			const u = info.view.toUserDelta(dx, dy);
			return info.ranges.map((r) => ({
				kind: 'move',
				...r,
				dx: u.dx,
				dy: u.dy,
			}));
		};

		const deleteEdits = (info: ProxyInfo): ContentEdit[] =>
			info.ranges.map((r) => ({ kind: 'delete', ...r }));

		// text editing: an IText in the page font stands in for the double-clicked line until commit
		interface Editing {
			proxy: FabricObject;
			itext: IText;
			info: ProxyInfo;
			line: TextLine;
			face: PageFontFace | null;
			onKey: (e: KeyboardEvent) => void;
			cancelled: boolean;
			done: boolean;
		}
		let editing: Editing | null = null;
		let pendingEdit: FabricObject | null = null;
		let lastPress: { target: FabricObject | null; at: number } = {
			target: null,
			at: 0,
		};
		// fabric puts the first baseline this far below the text top (lineHeight 1.16, fontSizeMult 1.13, fraction 0.222)
		const BASELINE = 0.879;

		const codesOf = (run: TextRun) => run.glyphs.map((g) => g.code);
		// the editor holds pdf.js glyph strings; the stored text is the font's own unicode reading
		const unicodeOf = (run: TextRun, codes: number[]) =>
			run.font
				.decode(
					Uint8Array.from(
						run.font.codeBytes === 2
							? codes.flatMap((c) => [
									c >> 8,
									c & 255,
								])
							: codes,
					),
				)
				.map((g) => g.text)
				.join('');
		const showCodes = (
			face: PageFontFace | null,
			run: TextRun,
			codes: number[],
		) =>
			face
				? face.display(codes)
				: codes
						.map(
							(c) =>
								run.glyphs.find(
									(g) =>
										g.code ===
										c,
								)?.text ??
								String.fromCharCode(
									c,
								),
						)
						.join('');

		const startTextEdit = async (proxy: FabricObject) => {
			const info = proxyInfo.get(proxy);
			const doc = store.getSnapshot();
			const page = doc?.pages.find(
				(p) => p.id === info?.pageId,
			);
			const slot = info ? slotOf(info.pageId) : null;
			if (
				!info?.line ||
				!page ||
				page.sourceIndex === null ||
				!slot
			)
				return;
			if (editing) finishTextEdit(true);
			const line = info.line;
			const run0 = line.runs[0]!;
			const face = await pageFontFace(
				page.sourceIndex,
				run0.font.baseFont,
			).catch(() => null);
			if (
				getActiveTool() !== 'content' ||
				!canvas.contains(proxy)
			)
				return;
			const text = line.runs
				.map(
					(r, i) =>
						(line.gaps[i] ? ' ' : '') +
						showCodes(face, r, codesOf(r)),
				)
				.join('');
			const o = info.view.toDisplayedPoint(
				run0.trm[4],
				run0.trm[5],
			);
			const ahead = applyMatrix(run0.trm, 1, 0);
			const d = info.view.toDisplayedPoint(ahead.x, ahead.y);
			const angle = Math.atan2(d.y - o.y, d.x - o.x);
			const rise = BASELINE * run0.fontSize;
			const fill = run0.fill
				? `rgb(${run0.fill.map((c) => Math.round(c * 255)).join(' ')})`
				: '#000';
			const itext = new IText(text, {
				left: slot.x + o.x + rise * Math.sin(angle),
				top: slot.y + o.y - rise * Math.cos(angle),
				originX: 'left',
				originY: 'top',
				angle: (angle * 180) / Math.PI,
				fontFamily: face?.family ?? FONT,
				fontSize: run0.fontSize,
				fill,
				// covers the rendered original underneath while typing
				backgroundColor: '#fff',
				hasControls: false,
				lockMovementX: true,
				lockMovementY: true,
				editingBorderColor: ACCENT,
				cursorColor: ACCENT,
			});
			const onKey = (e: KeyboardEvent) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.stopPropagation();
					if (editing && !refuse(editing))
						itext.exitEditing();
				} else if (e.key === 'Escape') {
					if (editing) editing.cancelled = true;
				}
			};
			editing = {
				proxy,
				itext,
				info,
				line,
				face,
				onKey,
				cancelled: false,
				done: false,
			};
			proxy.visible = false;
			canvas.add(itext);
			canvas.setActiveObject(itext);
			itext.enterEditing();
			itext.selectAll();
			itext.hiddenTextarea?.addEventListener(
				'keydown',
				onKey,
				true,
			);
			itext.on('changed', () => {
				if (editing?.itext === itext) refuse(editing);
			});
			itext.on('editing:exited', () => {
				if (editing?.itext === itext)
					finishTextEdit(editing.cancelled);
			});
			hud.hidden = true;
			canvas.requestRenderAll();
		};

		/**
		 * map the editor's string back to charcodes. `bad` lists characters the run's font cannot
		 * show; `fallback` is the same text in WinAnsi for the substitute font, null when a
		 * character is outside that too
		 */
		const encodeEdit = (
			e: Editing,
			text: string,
		): {
			codes: number[];
			bad: string[];
			fallback: number[] | null;
		} => {
			const run0 = e.line.runs[0]!;
			const byGlyph = new Map<string, number>();
			const byGlyphText = new Map<string, string>();
			for (const r of e.line.runs)
				for (const g of r.glyphs) {
					const shown = showCodes(e.face, r, [
						g.code,
					]);
					byGlyph.set(shown, g.code);
					byGlyphText.set(shown, g.text);
				}
			const codes: number[] = [];
			const bad: string[] = [];
			let fallback: number[] | null = [];
			for (const ch of text.replace(/\r?\n/g, '')) {
				const known = byGlyph.get(ch);
				if (known !== undefined) {
					codes.push(known);
				} else {
					const code = run0.font.encode(ch);
					if (code === null) bad.push(ch);
					else {
						codes.push(code);
						byGlyph.set(ch, code);
					}
				}
				const w = winAnsiCode(
					byGlyphText.get(ch) ?? ch,
				);
				if (w === null) fallback = null;
				else fallback?.push(w);
			}
			return { codes, bad, fallback };
		};

		/**
		 * characters the run's font has no glyph for. Ones WinAnsi covers go out in the substitute
		 * font and the hud turns red; ones outside that too keep the editor open
		 */
		const refuse = (e: Editing): boolean => {
			const { bad, fallback } = encodeEdit(e, e.itext.text);
			if (!bad.length) {
				warnHud(e.itext, null);
				return false;
			}
			warnHud(
				e.itext,
				fallback
					? 'Font unavailable'
					: `✗ ${[...new Set(bad)].join('')}`,
			);
			return fallback === null;
		};
		const warnHud = (t: FabricObject, text: string | null) => {
			hud.classList.toggle('is-warn', text !== null);
			if (text === null) {
				hud.hidden = true;
				return;
			}
			hud.replaceChildren(chip(text));
			hudTarget = t;
			placeHud();
		};

		const finishTextEdit = (cancel: boolean) => {
			const e = editing;
			if (!e || e.done) return;
			const text = e.itext.text.replace(/\r?\n/g, '');
			const { codes, bad, fallback } = encodeEdit(e, text);
			const substitute = bad.length > 0 && fallback !== null;
			// leaving the editor with characters no font here can show drops the edit
			if (!cancel && (bad.length === 0 || substitute)) {
				const runs = e.line.runs;
				const edits: ContentEdit[] = runs
					.slice(1)
					.map((r) => ({
						kind: 'delete',
						stream: r.stream,
						from: r.from,
						to: r.to,
					}));
				const first = runs[0]!;
				edits.push(
					codes.length
						? {
								kind: 'text',
								stream: first.stream,
								from: first.from,
								to: first.to,
								text: substitute
									? text
									: unicodeOf(
											first,
											codes,
										),
								codes: substitute
									? fallback
									: codes,
								...(substitute
									? {
											font: 'Helvetica' as const,
										}
									: {}),
							}
						: {
								kind: 'delete',
								stream: first.stream,
								from: first.from,
								to: first.to,
							},
				);
				reselect = codes.length
					? {
							pageId: e.info.pageId,
							left: e.info.left,
							top: e.info.top,
						}
					: null;
				queueMicrotask(() =>
					addContentEdits(
						e.info.pageId,
						orderEdits(edits),
					),
				);
			}
			e.done = true;
			editing = null;
			hudTarget = null;
			hud.classList.remove('is-warn');
			e.itext.hiddenTextarea?.removeEventListener(
				'keydown',
				e.onKey,
				true,
			);
			if (e.itext.isEditing) e.itext.exitEditing();
			canvas.remove(e.itext);
			e.proxy.visible = true;
			hud.hidden = true;
			canvas.requestRenderAll();
		};

		const applyTool = () => {
			const tool = getActiveTool();
			const s = getToolSettings();
			canvas.isDrawingMode = tool === 'ink';
			brush.color = s.colour;
			brush.width = s.strokeWidth;
			const interactive = tool === 'select';
			const content = tool === 'content';
			if (!content && editing) finishTextEdit(true);
			canvas.selection = interactive || content;
			canvas.skipTargetFind =
				tool === 'shape' ||
				tool === 'highlight' ||
				tool === 'crop';
			for (const { fabric } of tracked.values()) {
				fabric.selectable =
					interactive ||
					(tool === 'text' &&
						fabric instanceof IText);
				fabric.evented = fabric.selectable;
			}
			if (!interactive && tool !== 'text')
				canvas.discardActiveObject();
			canvas.defaultCursor =
				interactive || content
					? 'default'
					: 'crosshair';
			refreshProxies();
			canvas.requestRenderAll();
		};

		let debugRects: FabricObject[] = [];
		let previews: FabricObject[] = [];
		registerCanvasActions({
			preview: (items) => {
				for (const f of previews) canvas.remove(f);
				previews = items.flatMap(
					({ index, object }) => {
						const slot = slotAt(index);
						const f = slot
							? build(object, slot)
							: null;
						if (!f) return [];
						f.set({
							selectable: false,
							evented: false,
							opacity: opacityOf(
								object,
							),
						});
						return [f];
					},
				);
				for (const f of previews) canvas.add(f);
				canvas.requestRenderAll();
			},
			selectObject: (id) => {
				const t = tracked.get(id);
				// images build once their bitmap has loaded; select then
				if (!t) {
					pendingSelect = id;
					return;
				}
				canvas.setActiveObject(t.fabric);
				canvas.requestRenderAll();
			},
			debugBoxes: (index, boxes) => {
				for (const r of debugRects) canvas.remove(r);
				const slot = slotAt(index);
				debugRects = slot
					? boxes.map(
							(b) =>
								new Rect({
									left:
										slot.x +
										b.x,
									top:
										slot.y +
										b.y,
									originX: 'left',
									originY: 'top',
									width: b.width,
									height: b.height,
									fill: 'transparent',
									stroke: b.colour,
									strokeWidth: 0.5,
									strokeUniform: true,
									selectable: false,
									evented: false,
								}),
						)
					: [];
				for (const r of debugRects) canvas.add(r);
				canvas.requestRenderAll();
			},
			deleteSelection: () => {
				const editing = canvas
					.getActiveObjects()
					.some(
						(f) =>
							f instanceof IText &&
							f.isEditing,
					);
				if (editing) return;
				if (
					commitProxyEdits(
						canvas.getActiveObjects(),
						deleteEdits,
					)
				)
					return;
				const byPage = new Map<string, string[]>();
				for (const f of canvas.getActiveObjects()) {
					const id = idOf(f);
					const t = id ? tracked.get(id) : null;
					if (!id || !t) continue;
					byPage.set(t.pageId, [
						...(byPage.get(t.pageId) ?? []),
						id,
					]);
				}
				canvas.discardActiveObject();
				for (const [pageId, ids] of byPage)
					removeObjects(pageId, ids);
			},
			pageRect: (index) => {
				const slot = slotAt(index);
				if (!slot) return null;
				const vpt = canvas.viewportTransform;
				const r = wrap.getBoundingClientRect();
				return {
					x: r.left + slot.x * vpt[0] + vpt[4],
					y: r.top + slot.y * vpt[3] + vpt[5],
					w: slot.width * vpt[0],
					h: slot.height * vpt[3],
				};
			},
		});

		const clampZoom = (z: number) =>
			Math.max(ZMIN, Math.min(ZMAX, z));
		const centre = () =>
			new Point(
				canvas.getWidth() / 2,
				canvas.getHeight() / 2,
			);
		const zoomAt = (factor: number, at = centre()) => {
			canvas.zoomToPoint(
				at,
				clampZoom(canvas.getZoom() * factor),
			);
			clampViewport();
			reportZoom(canvas.getZoom());
			scheduleVisible();
		};
		const fit = () => fitPage(getPageIndex());
		registerViewportController({
			zoomIn: () => zoomAt(1.2),
			zoomOut: () => zoomAt(1 / 1.2),
			fit,
			setZoom: (z) => zoomAt(clampZoom(z) / canvas.getZoom()),
			reset: () => zoomAt(1 / canvas.getZoom()),
			cycle: fit,
		});

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				const r = wrap.getBoundingClientRect();
				zoomAt(
					Math.pow(0.999, e.deltaY),
					new Point(
						e.clientX - r.left,
						e.clientY - r.top,
					),
				);
			} else {
				canvas.relativePan(
					new Point(-e.deltaX, -e.deltaY),
				);
				clampViewport();
				canvas.requestRenderAll();
				scheduleVisible();
			}
		};
		wrap.addEventListener('wheel', onWheel, { passive: false });

		const onPageIndex = () => {
			const index = getPageIndex();
			if (index === derivedIndex) return;
			derivedIndex = index;
			programmatic = true;
			scrollToPage(index);
			scheduleVisible();
		};

		if (import.meta.env.DEV) {
			const w = window as unknown as Record<string, unknown>;
			w.__errataCanvas = canvas;
			w.__errataSlots = () =>
				[...slots.values()].map((sl) => ({
					key: sl.key.slice(0, 40),
					tile: !!sl.tile,
					stale: sl.tile?.stale ?? null,
					job: !!sl.job,
				}));
		}

		const offDoc = store.subscribe(sync);
		const offPage = subscribePage(onPageIndex);
		const offTool = subscribeTool(applyTool);
		sync();

		return () => {
			offDoc();
			offPage();
			offTool();
			if (visibleRaf) cancelAnimationFrame(visibleRaf);
			if (tileTimer) clearTimeout(tileTimer);
			for (const slot of slots.values()) slot.job?.cancel();
			ro.disconnect();
			wrap.removeEventListener('wheel', onWheel);
			registerCanvasActions(null);
			registerViewportController(null);
			void canvas.dispose();
		};
	});

	<template>
		<div class="sub-canvas-wrap" {{this.mount}}>
			<canvas></canvas>
			<div class="err-hud" hidden></div>
		</div>
	</template>
}
