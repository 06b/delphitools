import Component from '@glimmer/component';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import {
	chooseTool,
	pickImages,
} from 'delphitools-v2/components/substrata/editor/tools';
import { getSnapshot, subscribe } from 'delphitools-v2/lib/substrata/doc-store';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import 'delphitools-v2/components/substrata/editor/tool-bar/tools.css';

// an empty scene's start: a framed pair of named cells over a note
export default class EmptyHint extends Component {
	doc = new TrackedExternal(subscribe, getSnapshot);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
	}

	get shown() {
		const doc = this.doc.current;
		return !!doc && doc.layers.length === 0;
	}

	pickImage = () => void pickImages();
	pickText = () => chooseTool('text');

	<template>
		{{#if this.shown}}
			<div class="sub-empty" data-empty-hint>
				<div class="sub-empty-card">
					<div class="sub-empty-actions">
						<Cell
							@label="Add image"
							@text="Add image"
							@icon="image-plus"
							@onClick={{this.pickImage}}
						/>
						<Cell
							@label="Add text"
							@text="Add text"
							@icon="type"
							@onClick={{this.pickText}}
						/>
					</div>
					<p class="sub-empty-note">Drop an image,
						or paste one.</p>
				</div>
			</div>
		{{/if}}
	</template>
}
