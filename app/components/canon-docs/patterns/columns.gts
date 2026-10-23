import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonDualList, {
	type CanonDualItem,
} from 'delphicanon/components/canon-dual-list';
import CanonStatus from 'delphicanon/components/canon-status';

export default class ColumnsPattern extends Component {
	@tracked hidden: CanonDualItem[] = [
		{ id: 'size', name: 'Size', caption: 'bytes' },
		{ id: 'kind', name: 'Kind', caption: 'type' },
	];
	@tracked shown: CanonDualItem[] = [
		{ id: 'name', name: 'Name', caption: 'text' },
		{ id: 'date', name: 'Date', caption: 'modified' },
		{ id: 'tags', name: 'Tags', caption: 'labels' },
	];

	get summary() {
		return this.shown.map((item) => item.name).join(' / ');
	}

	show = (id: string) => {
		const item = this.hidden.find((other) => other.id === id);
		if (!item) return;
		this.hidden = this.hidden.filter((other) => other !== item);
		this.shown = [...this.shown, item];
	};

	hide = (id: string) => {
		const item = this.shown.find((other) => other.id === id);
		if (!item) return;
		this.shown = this.shown.filter((other) => other !== item);
		this.hidden = [...this.hidden, item];
	};

	reorder = (id: string, delta: -1 | 1) => {
		const index = this.shown.findIndex((item) => item.id === id);
		const other = index + delta;
		if (index < 0 || other < 0 || other >= this.shown.length)
			return;
		const next = [...this.shown];
		[next[index], next[other]] = [next[other]!, next[index]!];
		this.shown = next;
	};

	<template>
		<CanonDualList
			@left={{this.hidden}}
			@right={{this.shown}}
			@leftTitle="Hidden"
			@rightTitle="Shown"
			@listHeight={{176}}
			@onMoveRight={{this.show}}
			@onMoveLeft={{this.hide}}
			@onReorder={{this.reorder}}
		/>
		<CanonStatus
			@text={{this.summary}}
			@tone="muted"
			@row={{true}}
		/>
	</template>
}
