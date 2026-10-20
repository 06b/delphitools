import {
	BoxGeometry,
	BufferGeometry,
	CanvasTexture,
	DirectionalLight,
	DoubleSide,
	BackSide,
	FrontSide,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	PCFShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	Scene,
	ShadowMaterial,
	SRGBColorSpace,
	Vector2,
	Vector3,
	WebGLRenderer,
	type Material,
	type Texture,
} from 'three';

export interface EngineHooks {
	/** The href of a link at page coordinates (0..1 from the top left), if any. */
	hitLink(page: number, u: number, v: number): string | undefined;
	follow(href: string): void;
	/** The leaves turned changed; `pages` are the page indices now facing up. */
	changed(pages: number[]): void;
	rendered(): void;
}

export interface EngineOptions {
	canvas: HTMLCanvasElement;
	pageCount: number;
	/** Page width over height. */
	aspect: number;
	startPage: number;
	reducedMotion: boolean;
	dark: boolean;
	hooks: EngineHooks;
}

interface Turn {
	leaf: Leaf;
	/** The grabbed point on the unturned leaf, page plane coordinates. */
	grab: Vector2;
	/** Where the grabbed point is now. */
	point: Vector2;
	from: Vector2;
	to: Vector2;
	lift: number;
	start: number;
	duration: number;
	forward: boolean;
	/** Ends on the left stack. */
	toLeft: boolean;
}

interface Leaf {
	index: number;
	front: number;
	back: number;
	geometry: PlaneGeometry;
	backGeometry: BufferGeometry;
	rest: Float32Array;
	frontMesh: Mesh;
	backMesh: Mesh;
	left: boolean;
	cover: boolean;
}

const H = 1;
const SEGMENTS_X = 60;
const SEGMENTS_Y = 24;
// a 150-page magazine is about 8 mm thick on a 28 cm page
const THICKNESS = 0.032;
// largest curl radius mid-turn, and how far a cover bends while it swings (rad)
const CURL_RADIUS = 0.085;
const COVER_BEND = 0.35;
const TURN_MS = 760;
const FAST_TURN_MS = 420;
const TILT = (4 * Math.PI) / 180;
const DEG = Math.PI / 180;
// resting angle on the desk; narrow screens tilt less so a page fits
const REST_TURN = { wide: -7 * DEG, narrow: -2.5 * DEG };
const OPEN_TURN = -1 * DEG;
const TOSS_MS = 900;
const TOSS_LIFT = 0.3;
const TOSS_SPIN = -21 * DEG;
const FOV = 30;
// a flat page facing the camera sums to about 1, so art keeps its colour
const HEMI = 0.3;
const SUN = 3.3;
const FILL = 0.15;
const COVER_ROUGHNESS = 0.85;
const PAPER = '#ffffff';

const ease = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function stripes(vertical: boolean): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = vertical ? 4 : 64;
	canvas.height = vertical ? 64 : 4;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#f4f2ec';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (let i = 0; i < 64; i += 2) {
		ctx.fillStyle = `rgba(0,0,0,${0.05 + (i % 6) * 0.012})`;
		if (vertical) ctx.fillRect(0, i, 4, 1);
		else ctx.fillRect(i, 0, 1, 4);
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

function contactShadow(): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext('2d')!;
	ctx.filter = 'blur(14px)';
	ctx.fillStyle = 'black';
	ctx.fillRect(26, 26, 76, 76);
	return new CanvasTexture(canvas);
}

function blankTexture(): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 4;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, 4, 4);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

function paperMaterial(
	map: Texture,
	spineAtRight: boolean,
	gutter: boolean,
	roughness: number,
): MeshPhysicalMaterial {
	// low specular: full sheen lifted a printed black to 37,36,35
	const material = new MeshPhysicalMaterial({
		map,
		roughness,
		metalness: 0,
		specularIntensity: 0.25,
		side: spineAtRight ? BackSide : FrontSide,
		shadowSide: DoubleSide,
	});
	if (!gutter) return material;
	const spine = spineAtRight ? '1.0 - vMapUv.x' : 'vMapUv.x';
	material.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <map_fragment>',
			`#include <map_fragment>
			float dtSpine = ${spine};
			diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 0.07, dtSpine))
				* mix(0.94, 1.0, smoothstep(0.0, 0.3, dtSpine));`,
		);
	};
	material.customProgramCacheKey = () => `dt-gutter-${spine}`;
	return material;
}

export function createEngine(options: EngineOptions) {
	const { canvas, hooks, pageCount } = options;
	const W = options.aspect * H;
	const { dark } = options;

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	const anisotropy = Math.min(
		8,
		renderer.capabilities.getMaxAnisotropy(),
	);

	const scene = new Scene();
	const camera = new PerspectiveCamera(FOV, 1, 0.05, 20);
	const magazine = new Group();
	scene.add(magazine);

	const hemi = new HemisphereLight('#ffffff', '#8a8a80', HEMI);
	scene.add(hemi);
	const sun = new DirectionalLight('#fffaf0', SUN);
	sun.position.set(-0.9, 1.3, 2.6);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -1.4;
	sun.shadow.camera.right = 1.4;
	sun.shadow.camera.top = 1.2;
	sun.shadow.camera.bottom = -1.2;
	sun.shadow.camera.near = 0.5;
	sun.shadow.camera.far = 6;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.012;
	sun.shadow.radius = 5;
	scene.add(sun);
	scene.add(sun.target);
	// from the viewer, so the stack edges facing the camera read as paper
	const fill = new DirectionalLight('#ffffff', FILL);
	fill.position.set(0.4, -2, 1.2);
	scene.add(fill);

	const table = new Mesh(
		new PlaneGeometry(8, 8),
		new ShadowMaterial({ opacity: 0.28 }),
	);
	table.position.z = -0.001;
	table.receiveShadow = true;
	scene.add(table);

	const contactTexture = contactShadow();
	const contacts = [1, -1].map((side) => {
		const mesh = new Mesh(
			new PlaneGeometry(W * 1.32, H * 1.22),
			new MeshBasicMaterial({
				map: contactTexture,
				transparent: true,
				opacity: 0.45,
				depthWrite: false,
				color: '#000000',
				alphaMap: contactTexture,
			}),
		);
		mesh.position.set(
			(side * W) / 2 + side * 0.01,
			-0.012,
			-0.0008,
		);
		magazine.add(mesh);
		return mesh;
	});

	const edgeU = stripes(false);
	const edgeV = stripes(true);
	const blockMaterials: Material[] = [
		new MeshStandardMaterial({ map: edgeU, roughness: 0.9 }),
		new MeshStandardMaterial({ map: edgeU, roughness: 0.9 }),
		new MeshStandardMaterial({ map: edgeV, roughness: 0.9 }),
		new MeshStandardMaterial({ map: edgeV, roughness: 0.9 }),
		new MeshStandardMaterial({ color: PAPER, roughness: 0.9 }),
		new MeshStandardMaterial({ color: PAPER, roughness: 0.9 }),
	];
	const blockGeometry = new BoxGeometry(1, 1, 1);
	blockGeometry.translate(0.5, 0, 0.5);
	const blocks = [1, -1].map((side) => {
		const mesh = new Mesh(blockGeometry, blockMaterials);
		mesh.scale.set(side * (W + 0.0015), H + 0.003, 0.0001);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		magazine.add(mesh);
		return mesh;
	});

	const blank = blankTexture();
	const textures = new Map<number, Texture>();
	const textureFor = (page: number) => textures.get(page) ?? blank;

	let narrow = false;
	/** The page of the spread in view on a narrow screen. */
	let side: 'left' | 'right' = 'right';
	let leaves: Leaf[] = [];
	let dz = 0;
	/** Leaves committed to the left stack, in flight included. */
	let turned = 0;
	let target = 0;
	const turns: Turn[] = [];
	let openness = 0;

	const leafCount = () => pageCount / 2;

	function buildLeaves() {
		for (const leaf of leaves) disposeLeaf(leaf);
		const count = leafCount();
		dz = THICKNESS / Math.max(count, 1);
		leaves = [];
		for (let index = 0; index < count; index++) {
			const front = index * 2;
			const back = index * 2 + 1;
			const cover = index === 0 || index === count - 1;
			const geometry = new PlaneGeometry(
				W,
				H,
				SEGMENTS_X,
				SEGMENTS_Y,
			);
			geometry.translate(W / 2, 0, 0);
			const backGeometry = new BufferGeometry();
			backGeometry.setIndex(geometry.index);
			backGeometry.setAttribute(
				'position',
				geometry.attributes.position!,
			);
			backGeometry.setAttribute(
				'normal',
				geometry.attributes.normal!,
			);
			const uv = geometry.attributes.uv!.clone();
			for (let i = 0; i < uv.count; i++)
				uv.setX(i, 1 - uv.getX(i));
			backGeometry.setAttribute('uv', uv);
			// the outside of a cover is coated stock: glossy, no gutter
			const frontCover = index === 0;
			const backCover = index === count - 1;
			const frontMesh = new Mesh(
				geometry,
				paperMaterial(
					textureFor(front),
					false,
					!frontCover,
					frontCover ? COVER_ROUGHNESS : 0.82,
				),
			);
			const backMesh = new Mesh(
				backGeometry,
				paperMaterial(
					textureFor(back),
					true,
					!backCover,
					backCover ? 0.42 : 0.82,
				),
			);
			frontMesh.castShadow = true;
			frontMesh.receiveShadow = true;
			backMesh.receiveShadow = true;
			magazine.add(frontMesh, backMesh);
			const leaf: Leaf = {
				index,
				front,
				back,
				geometry,
				backGeometry,
				rest: Float32Array.from(
					geometry.attributes.position!.array,
				),
				frontMesh,
				backMesh,
				left: index < turned,
				cover,
			};
			frontMesh.userData = { leaf, back: false };
			backMesh.userData = { leaf, back: true };
			leaves.push(leaf);
		}
	}

	function disposeLeaf(leaf: Leaf) {
		magazine.remove(leaf.frontMesh, leaf.backMesh);
		leaf.geometry.dispose();
		leaf.backGeometry.dispose();
		(leaf.frontMesh.material as Material).dispose();
		(leaf.backMesh.material as Material).dispose();
	}

	// spine lift: an open magazine rises from the stitched gutter
	const lift = (x: number) =>
		0.014 * openness * (1 - Math.exp(-Math.abs(x) / 0.045));

	const zRight = (leaf: Leaf) => (leaves.length - leaf.index) * dz;
	const zLeft = (leaf: Leaf) => (leaf.index + 1) * dz;

	const N = new Vector2();
	const A = new Vector2();

	/**
	 * Cylinder page curl: the grabbed point is carried to `point` by folding
	 * the leaf over a cylinder whose axis is perpendicular to grab→point.
	 * Paper left of the axis stays flat, paper on the cylinder wraps, paper
	 * past half a turn lies flipped above. Lengths are preserved.
	 */
	function deform(leaf: Leaf, turn: Turn | undefined) {
		const position = leaf.geometry.attributes.position!;
		const out = position.array as Float32Array;
		const rest = leaf.rest;
		const zR = zRight(leaf);
		const zL = zLeft(leaf);
		if (!turn) {
			const sign = leaf.left ? -1 : 1;
			const z = leaf.left ? zL : zR;
			for (let i = 0; i < rest.length; i += 3) {
				const x = rest[i]!;
				out[i] = sign * x;
				out[i + 1] = rest[i + 1]!;
				out[i + 2] = z + lift(x);
			}
		} else if (leaf.cover) {
			// a cover is stiff: it swings on the spine, the free edge lagging
			const phi = Math.acos(
				Math.max(
					-1,
					Math.min(
						1,
						turn.point.x /
							Math.max(
								turn.grab.x,
								1e-4,
							),
					),
				),
			);
			const k =
				((turn.forward ? -1 : 1) *
					COVER_BEND *
					Math.sin(phi)) /
				W;
			const base = zR + (zL - zR) * (phi / Math.PI);
			for (let i = 0; i < rest.length; i += 3) {
				const s = rest[i]!;
				const flat = Math.abs(k) < 1e-6;
				out[i] = flat
					? s * Math.cos(phi)
					: (Math.sin(phi + k * s) -
							Math.sin(phi)) /
						k;
				out[i + 1] = rest[i + 1]!;
				out[i + 2] =
					(flat
						? s * Math.sin(phi)
						: (Math.cos(phi) -
								Math.cos(
									phi +
										k *
											s,
								)) /
							k) +
					base +
					lift(s);
			}
		} else {
			const { grab, point } = turn;
			const distance = grab.distanceTo(point);
			const span = Math.max(2 * grab.x, 1e-4);
			const s = clamp01(distance / span);
			let r = CURL_RADIUS * Math.sin(Math.PI * s) + 0.0015;
			N.subVectors(grab, point);
			if (distance < 1e-5) N.set(1, 0);
			else N.divideScalar(distance);
			let a = (distance - Math.PI * r) / 2;
			if (a < 0) {
				r = Math.max(distance / Math.PI, 1e-4);
				a = 0;
			}
			A.copy(point).addScaledVector(N, a);
			// keep the stitched edge flat: neither spine end may fold
			let shift = 0;
			for (const y of [-H / 2, H / 2]) {
				const d = (0 - A.x) * N.x + (y - A.y) * N.y;
				if (d > shift) shift = d;
			}
			A.addScaledVector(N, shift);
			const halfTurn = Math.PI * r;
			for (let i = 0; i < rest.length; i += 3) {
				const x = rest[i]!;
				const y = rest[i + 1]!;
				const d = (x - A.x) * N.x + (y - A.y) * N.y;
				const footX = x - N.x * d;
				const footY = y - N.y * d;
				let along: number;
				let z: number;
				if (d <= 0) {
					along = d;
					z = zR;
				} else if (d < halfTurn) {
					const angle = d / r;
					along = r * Math.sin(angle);
					z =
						r * (1 - Math.cos(angle)) +
						zR +
						(zL - zR) * (angle / Math.PI);
				} else {
					along = halfTurn - d;
					z = 2 * r + zL;
				}
				out[i] = footX + N.x * along;
				out[i + 1] = footY + N.y * along;
				out[i + 2] = z + lift(x);
			}
		}
		position.needsUpdate = true;
		leaf.geometry.computeVertexNormals();
		leaf.geometry.computeBoundingSphere();
		leaf.backGeometry.boundingSphere = leaf.geometry.boundingSphere;
	}

	function visiblePages(): number[] {
		const pages: number[] = [];
		if (turned > 0) pages.push(turned * 2 - 1);
		if (turned < leaves.length) pages.push(turned * 2);
		if (narrow && pages.length === 2)
			return [pages[side === 'left' ? 0 : 1]!];
		return pages;
	}

	const turnedForPage = (page: number) => Math.ceil(page / 2);

	// camera
	const view = { x: W / 2, width: W, intro: 1 };
	const toss = { start: performance.now(), t: 0 };
	let size = { width: 1, height: 1 };

	function framing() {
		if (turned === 0) return { x: W / 2, width: W };
		if (turned === leaves.length) return { x: -W / 2, width: W };
		// a narrow screen watches the spine while a leaf crosses it
		if (narrow && turns.length) return { x: 0, width: W };
		if (narrow)
			return {
				x: side === 'left' ? -W / 2 : W / 2,
				width: W,
			};
		return { x: 0, width: 2 * W };
	}

	function placeCamera() {
		const aspect = size.width / size.height;
		const half = Math.tan(((FOV / 2) * Math.PI) / 180);
		const margin = narrow ? 1.1 : 1.32;
		const distance =
			Math.max(
				(H * margin) / 2 / half,
				(view.width * margin) / 2 / (half * aspect),
			) * view.intro;
		camera.position.set(
			view.x,
			-Math.sin(TILT) * distance,
			Math.cos(TILT) * distance,
		);
		camera.lookAt(view.x, 0, 0);
		sun.target.position.set(view.x, 0, 0);
		sun.position.set(view.x - 0.9, 1.3, 2.6);
	}

	// lands at 45% of the toss, then slides and turns to rest
	function placeMagazine(now: number) {
		toss.t = options.reducedMotion
			? 1
			: Math.min(1, (now - toss.start) / TOSS_MS);
		const slide = 1 - easeOut(toss.t);
		const fall = Math.max(0, 1 - toss.t / 0.45);
		const rest = REST_TURN[narrow ? 'narrow' : 'wide'];
		const angle =
			rest +
			(OPEN_TURN - rest) * openness +
			TOSS_SPIN * slide;
		const pivot = view.x;
		magazine.rotation.set(0, 0, angle);
		magazine.position.set(
			pivot - pivot * Math.cos(angle) + 0.7 * W * slide,
			-pivot * Math.sin(angle) - 1.2 * H * slide,
			TOSS_LIFT * fall * fall,
		);
		for (const contact of contacts)
			contact.material.opacity = 0.45 * (1 - fall);
	}

	function resize() {
		const width = canvas.clientWidth || 1;
		const height = canvas.clientHeight || 1;
		size = { width, height };
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		const wasNarrow = narrow;
		narrow = width / height < 0.85 && width < 760;
		if (narrow !== wasNarrow) hooks.changed(visiblePages());
		dirty = true;
	}

	// turning
	function startTurn(
		leaf: Leaf,
		forward: boolean,
		duration: number,
	): Turn {
		const grab = new Vector2(W, -0.32 * H);
		const mirrored = new Vector2(-W, grab.y);
		const turn: Turn = {
			leaf,
			grab,
			point: (forward ? grab : mirrored).clone(),
			from: (forward ? grab : mirrored).clone(),
			to: (forward ? mirrored : grab).clone(),
			lift: 0.16 * H,
			start: performance.now(),
			duration,
			forward,
			toLeft: forward,
		};
		turns.push(turn);
		return turn;
	}

	function settle(turn: Turn) {
		turn.leaf.left = turn.toLeft;
		turns.splice(turns.indexOf(turn), 1);
	}

	function advance(now: number) {
		for (const turn of [...turns]) {
			const t = clamp01((now - turn.start) / turn.duration);
			const e = turn.lift ? ease(t) : easeOut(t);
			turn.point.lerpVectors(turn.from, turn.to, e);
			turn.point.y += turn.lift * Math.sin(Math.PI * e);
			if (t >= 1) settle(turn);
		}
		const busy = turns.at(-1);
		const ready = !busy || now - busy.start > busy.duration * 0.3;
		if (!ready || turned === target) return;
		const forward = target > turned;
		const leaf = leaves[forward ? turned : turned - 1];
		if (!leaf || turns.some((turn) => turn.leaf === leaf)) return;
		turned += forward ? 1 : -1;
		const queued = Math.abs(target - turned) > 0;
		if (options.reducedMotion) leaf.left = forward;
		else startTurn(leaf, forward, queued ? FAST_TURN_MS : TURN_MS);
		hooks.changed(visiblePages());
	}

	function goTo(page: number) {
		side = page % 2 === 1 ? 'left' : 'right';
		target = Math.min(
			leaves.length,
			Math.max(0, turnedForPage(page)),
		);
		dirty = true;
	}

	// inside the magazine on a narrow screen, the first step pans across the spread
	const inside = () =>
		turned > 0 && turned < leaves.length && turned === target;
	const next = () => {
		if (narrow && side === 'left' && inside()) {
			side = 'right';
			hooks.changed(visiblePages());
			dirty = true;
			return;
		}
		side = 'left';
		target = Math.min(leaves.length, Math.max(target, turned) + 1);
		dirty = true;
	};
	const prev = () => {
		if (narrow && side === 'right' && inside()) {
			side = 'left';
			hooks.changed(visiblePages());
			dirty = true;
			return;
		}
		side = 'right';
		target = Math.max(0, Math.min(target, turned) - 1);
		dirty = true;
	};

	// picking
	const raycaster = new Raycaster();
	const ndc = new Vector2();

	function setRay(event: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		ndc.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1,
		);
		raycaster.setFromCamera(ndc, camera);
	}

	interface Hit {
		leaf?: Leaf;
		page?: number;
		u: number;
		v: number;
		x: number;
		y: number;
	}

	function pick(event: MouseEvent): Hit | undefined {
		setRay(event);
		const meshes = [
			...leaves.flatMap((leaf) => [
				leaf.frontMesh,
				leaf.backMesh,
			]),
			...blocks,
		];
		const [first] = raycaster.intersectObjects(meshes, false);
		if (!first) return undefined;
		const local = magazine.worldToLocal(first.point.clone());
		const data = first.object.userData as {
			leaf?: Leaf;
			back?: boolean;
		};
		if (!data.leaf || !first.uv) return { u: 0, v: 0, ...local };
		const page = data.back ? data.leaf.back : data.leaf.front;
		return {
			leaf: data.leaf,
			page: page < 0 ? undefined : page,
			u: first.uv.x,
			v: 1 - first.uv.y,
			x: local.x,
			y: local.y,
		};
	}

	const zone = (event: MouseEvent) => {
		const rect = canvas.getBoundingClientRect();
		return event.clientX - rect.left < rect.width / 2
			? 'prev'
			: 'next';
	};

	function linkAt(event: MouseEvent) {
		const hit = pick(event);
		return hit?.page === undefined
			? undefined
			: hooks.hitLink(hit.page, hit.u, hit.v);
	}

	const onPointerMove = (event: PointerEvent) => {
		canvas.style.cursor = linkAt(event)
			? 'pointer'
			: zone(event) === 'next'
				? 'e-resize'
				: 'w-resize';
	};

	const onClick = (event: MouseEvent) => {
		const href = linkAt(event);
		if (href) hooks.follow(href);
		else if (zone(event) === 'next') next();
		else prev();
	};

	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('click', onClick);
	const observer = new ResizeObserver(resize);
	observer.observe(canvas);

	// loop
	let dirty = true;
	let frame = 0;
	let last = performance.now();
	const frameTimes: number[] = [];

	function loop(now: number) {
		frame = requestAnimationFrame(loop);
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		const animating = turns.length > 0 || turned !== target;
		const goal = framing();
		const closed =
			(turned === 0 || turned === leaves.length) &&
			turns.length === 0;
		const settleRate = options.reducedMotion
			? 1
			: 1 - Math.exp(-dt * 4.5);
		const moving =
			Math.abs(view.x - goal.x) > 1e-4 ||
			Math.abs(view.width - goal.width) > 1e-4 ||
			Math.abs(view.intro - 1) > 1e-4 ||
			Math.abs(openness - (closed ? 0 : 1)) > 1e-3 ||
			toss.t < 1;
		if (!dirty && !animating && !moving) return;
		const started = performance.now();
		dirty = false;
		advance(now);
		view.x += (goal.x - view.x) * settleRate;
		view.width += (goal.width - view.width) * settleRate;
		view.intro += (1 - view.intro) * settleRate;
		openness += ((closed ? 0 : 1) - openness) * settleRate;
		placeMagazine(now);
		placeCamera();
		const rightCount = leaves.filter(
			(leaf) =>
				!leaf.left &&
				!turns.some((turn) => turn.leaf === leaf),
		).length;
		const leftCount = leaves.filter(
			(leaf) =>
				leaf.left &&
				!turns.some((turn) => turn.leaf === leaf),
		).length;
		blocks[0]!.scale.z = Math.max(rightCount * dz - dz * 0.5, 1e-4);
		blocks[1]!.scale.z = Math.max(leftCount * dz - dz * 0.5, 1e-4);
		blocks[0]!.visible = rightCount > 0;
		blocks[1]!.visible = leftCount > 0;
		contacts[0]!.visible = rightCount > 0 || turned < leaves.length;
		contacts[1]!.visible = turned > 0;
		for (const leaf of leaves)
			deform(
				leaf,
				turns.find((turn) => turn.leaf === leaf),
			);
		hemi.intensity = dark ? HEMI * 0.9 : HEMI;
		sun.intensity = dark ? SUN * 0.9 : SUN;
		table.material.opacity = dark ? 0.45 : 0.28;
		renderer.render(scene, camera);
		if (animating) {
			frameTimes.push(performance.now() - started);
			if (frameTimes.length > 240) frameTimes.shift();
		}
		hooks.rendered();
	}

	function setTexture(page: number, source: HTMLCanvasElement) {
		const texture = new CanvasTexture(source);
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = anisotropy;
		textures.get(page)?.dispose();
		textures.set(page, texture);
		for (const leaf of leaves) {
			if (leaf.front === page)
				(
					leaf.frontMesh
						.material as MeshStandardMaterial
				).map = texture;
			if (leaf.back === page)
				(
					leaf.backMesh
						.material as MeshStandardMaterial
				).map = texture;
		}
		dirty = true;
	}

	/** The on-screen box, in CSS px, of a page area at rest. */
	function screenRect(
		page: number,
		u0: number,
		v0: number,
		u1: number,
		v1: number,
	) {
		const left = page % 2 === 1;
		const toX = (u: number) => (left ? (u - 1) * W : u * W);
		const rect = canvas.getBoundingClientRect();
		const xs: number[] = [];
		const ys: number[] = [];
		for (const [u, v] of [
			[u0, v0],
			[u1, v0],
			[u0, v1],
			[u1, v1],
		] as const) {
			const p = new Vector3(toX(u), (0.5 - v) * H, THICKNESS);
			magazine.localToWorld(p).project(camera);
			xs.push(rect.left + ((p.x + 1) / 2) * rect.width);
			ys.push(rect.top + ((1 - p.y) / 2) * rect.height);
		}
		return {
			left: Math.min(...xs),
			top: Math.min(...ys),
			width: Math.max(...xs) - Math.min(...xs),
			height: Math.max(...ys) - Math.min(...ys),
		};
	}

	resize();
	turned = target = 0;
	buildLeaves();
	if (options.reducedMotion) view.intro = 1;
	if (options.startPage > 0) {
		if (options.reducedMotion) {
			turned = target = turnedForPage(options.startPage);
			for (const leaf of leaves)
				leaf.left = leaf.index < turned;
		} else goTo(options.startPage);
	}
	hooks.changed(visiblePages());
	frame = requestAnimationFrame(loop);

	return {
		next,
		prev,
		goTo,
		first: () => goTo(0),
		last: () => goTo(pageCount - 1),
		setTexture,
		screenRect,
		get pages() {
			return visiblePages();
		},
		get settled() {
			return turns.length === 0 && turned === target;
		},
		get narrow() {
			return narrow;
		},
		/** For harnesses: the page area's centre on screen. */
		pointFor(page: number, u: number, v: number) {
			const rect = screenRect(page, u, v, u, v);
			return { x: rect.left, y: rect.top };
		},
		frameStats() {
			const sorted = [...frameTimes].sort((a, b) => a - b);
			return {
				samples: sorted.length,
				median:
					sorted[Math.floor(sorted.length / 2)] ??
					0,
				p95:
					sorted[
						Math.floor(sorted.length * 0.95)
					] ?? 0,
			};
		},
		dispose() {
			cancelAnimationFrame(frame);
			observer.disconnect();
			canvas.removeEventListener(
				'pointermove',
				onPointerMove,
			);
			canvas.removeEventListener('click', onClick);
			for (const leaf of leaves) disposeLeaf(leaf);
			for (const texture of textures.values())
				texture.dispose();
			for (const material of blockMaterials)
				material.dispose();
			for (const mesh of [table, ...contacts]) {
				mesh.geometry.dispose();
				(mesh.material as Material).dispose();
			}
			blockGeometry.dispose();
			[blank, edgeU, edgeV, contactTexture].forEach((t) =>
				t.dispose(),
			);
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}

export type MagazineEngine = ReturnType<typeof createEngine>;
