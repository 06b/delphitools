import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Slot from 'delphitools-v2/components/tools/media/slot';
import '../../tools/media/media.css';

const ACCEPT = 'image/*';
const Trash = <template><IconSvg @name="trash-2" /></template>;

export default class DropSlotBlock extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked url = '';
	@tracked name = '';
	@tracked size = 0;

	willDestroy() {
		super.willDestroy();
		this.clear();
	}

	load = (file: File) => {
		this.clear();
		this.url = URL.createObjectURL(file);
		this.name = file.name;
		this.size = file.size;
	};

	clear = () => {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = '';
		this.name = '';
		this.size = 0;
	};

	<template>
		<CanonSplit
			@halves={{true}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
				>
					{{#if this.url}}
						<img
							class="cd-drop-image"
							src={{this.url}}
							alt={{this.name}}
						/>
					{{else}}
						<Slot
							@prompt="Drop an image"
							@icon="image-plus"
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.url}}
						<CanonRow
							@title={{this.name}}
							@detail={{formatBytes
								this.size
							}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<CanonEmptyRow @text="None" />
					{{/if}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
