import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand, {
	readoutBandHeight,
} from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import type CanonToastService from 'delphicanon/services/canon-toast';
import AtlasOpenIn from 'delphitools-v2/components/atlas-open-in';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import {
	analyzeMedia,
	reportText,
	sections,
	type Track,
} from 'delphitools-v2/lib/mediainfo';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Sections from 'delphitools-v2/components/tools/media/sections';
import Slot from 'delphitools-v2/components/tools/media/slot';
import Strips from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import {
	release,
	thumbnails,
} from 'delphitools-v2/components/tools/media/frames';
import './media/media.css';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const READ_ERROR = "Couldn't read that file's container";
// four frames on a phone (iOS stripHeight)
const bandHeight = readoutBandHeight(56);
// iOS: height over width at most 1.25, at most 340 pt tall
const tallest = 1.25;
const tallestPreview = 340;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Pip = <template><IconSvg @name="picture-in-picture-2" /></template>;
const Full = <template><IconSvg @name="maximize" /></template>;

const pipSupported = () =>
	typeof document !== 'undefined' && document.pictureInPictureEnabled;

/** The port of VideoAtlasViewController, on the web tool's MediaInfo report. */
export default class VideoAtlas extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	intake = new VideoIntake({ onLoad: (file) => this.#load(file) });
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));
	playback = new Playback();

	@tracked tracks: Track[] = [];
	@tracked busy = false;
	@tracked failed = false;
	@tracked frames: string[] = [];
	@tracked aspect = 16 / 9;

	#token = 0;
	#video?: HTMLVideoElement;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.intake.release();
		release(this.frames);
	}

	get loaded() {
		return this.intake.url !== null;
	}

	@cached
	get sections() {
		return sections(this.tracks);
	}

	get streamSummary() {
		const n = this.sections.filter(
			(s) => s.type !== 'General',
		).length;
		if (!n) return '';
		return n === 1 ? '1 stream' : `${n} streams`;
	}

	get warning() {
		if (this.intake.error) return this.intake.error;
		if (this.failed) return READ_ERROR;
		return '';
	}

	get detail() {
		if (this.warning) return this.warning;
		if (this.busy) return 'Reading…';
		return this.streamSummary;
	}

	get previewAspect() {
		return Math.max(this.aspect, 1 / tallest);
	}

	get ready() {
		return this.intake.duration > 0;
	}

	#load(file: File) {
		const token = ++this.#token;
		const live = () => token === this.#token;
		release(this.frames);
		this.frames = [];
		this.tracks = [];
		this.failed = false;
		this.busy = true;
		void thumbnails(file, live).then((urls) => {
			if (!live()) return release(urls);
			this.frames = urls;
		});
		void (async () => {
			try {
				const tracks = await analyzeMedia(file);
				if (live()) this.tracks = tracks;
			} catch (error) {
				if (!live()) return;
				console.error('MediaInfo failed:', error);
				this.failed = true;
			} finally {
				if (live()) this.busy = false;
			}
		})();
	}

	keepVideo = modifier((video: HTMLVideoElement) => {
		this.#video = video;
		// full screen has no transport: the browser's controls stand in
		const controls = () =>
			(video.controls = document.fullscreenElement === video);
		video.addEventListener('fullscreenchange', controls);
		return () => {
			video.removeEventListener('fullscreenchange', controls);
			if (this.#video === video) this.#video = undefined;
		};
	});

	metadata = (event: Event) => {
		this.intake.ready(event);
		const video = event.target as HTMLVideoElement;
		if (video.videoWidth && video.videoHeight)
			this.aspect = video.videoWidth / video.videoHeight;
	};

	copy = () => {
		if (this.tracks.length)
			void this.toast.copy(reportText(this.tracks));
	};

	pictureInPicture = () => {
		const video = this.#video;
		if (!video) return;
		if (document.pictureInPictureElement === video)
			void document.exitPictureInPicture();
		else void video.requestPictureInPicture().catch(() => {});
	};

	fullScreen = () =>
		void this.#video?.requestFullscreen().catch(() => {});

	clear = () => {
		this.playback.unload();
		this.#token++;
		this.intake.clear();
		release(this.frames);
		this.frames = [];
		this.tracks = [];
		this.busy = false;
		this.failed = false;
	};

	<template>
		<CanonSplit
			class="video-atlas"
			@bannerSticks={{true}}
			@mainLeadsStacked={{true}}
			@footerHidden={{if this.loaded false true}}
			{{filePaste this.intake.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<CanonReadoutBand
						@transport={{this.playback.transport}}
						@idle={{if
							this.intake.duration
							this.intake.duration
							null
						}}
						@readout="below"
					>
						{{#if this.loaded}}
							<Strips
								@thumbnails={{this.frames}}
								@aspect={{this.aspect}}
								@duration={{this.intake.duration}}
								@playhead={{this.playback.playhead}}
								@onScrub={{this.playback.scrub}}
							/>
						{{else}}
							<Slot
								class="va-slot"
								@prompt="Drop a video here"
								@icon="film"
								@accept={{ACCEPT}}
								@over={{this.drop.over}}
								@onFile={{this.intake.load}}
							/>
						{{/if}}
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<Sections @sections={{this.sections}} />
			</:sidebar>
			<:main>
				{{#if this.loaded}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="va-source"
							@title={{this.intake.fileName}}
							@detail={{this.detail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
						<CanonButton
							class="va-copy"
							@kind="primary"
							@text="Copy report"
							@icon={{Copy}}
							@disabled={{if
								this.tracks.length
								false
								true
							}}
							@onClick={{this.copy}}
						/>
					</CanonRows>
					<CanonCanvas
						class="va-preview"
						@aspect={{this.previewAspect}}
						@maxHeight={{tallestPreview}}
						@boxing="unlessWide"
						@background="#000"
					>
						{{! the transport is its control; user media lacks captions }}
						{{! template-lint-disable require-media-caption }}
						<video
							class="va-video"
							src={{this.intake.url}}
							playsinline
							preload="metadata"
							{{this.intake.register}}
							{{this.playback.register}}
							{{this.keepVideo}}
							{{on
								"loadedmetadata"
								this.metadata
							}}
							{{on
								"error"
								this.intake.failed
							}}
						></video>
					</CanonCanvas>
					<CanonRows
						class="va-open"
						@framed={{true}}
					>
						<CanonHeading @text="Open in" />
						<AtlasOpenIn
							@file={{this.intake.file}}
							@self="video-atlas"
						/>
					</CanonRows>
				{{else if this.warning}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							@text={{this.warning}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
			</:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{this.ready}}
				>
					{{#if (pipSupported)}}
						<CanonButton
							class="va-pip"
							@icon={{Pip}}
							@label="Picture in Picture"
							@disabled={{if
								this.ready
								false
								true
							}}
							@onClick={{this.pictureInPicture}}
						/>
					{{/if}}
					<CanonButton
						class="va-full"
						@icon={{Full}}
						@label="Full Screen"
						@disabled={{if
							this.ready
							false
							true
						}}
						@onClick={{this.fullScreen}}
					/>
				</Transport>
			</:footer>
		</CanonSplit>
	</template>
}
