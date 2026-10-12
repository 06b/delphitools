import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq, or } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import { Field, InputField } from 'delphitools-v2/components/errata/tool-panel';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import type {
	FieldObject,
	FieldType,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	getFieldDraft,
	getSelectedField,
	parseOptions,
	setFieldDraft,
	subscribeFields,
	type FieldDraft,
} from 'delphitools-v2/lib/errata/fields';
import { patchObjects, store } from 'delphitools-v2/lib/errata/store';
import { getActiveTool, setActiveTool } from 'delphitools-v2/lib/errata/tool';
import { loadSourceWidgets } from 'delphitools-v2/lib/errata/widgets';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const TYPES: { value: FieldType; icon: string; label: string }[] = [
	{ value: 'text', icon: 'text-cursor-input', label: 'Text' },
	{ value: 'checkbox', icon: 'square-check', label: 'Checkbox' },
	{ value: 'radio', icon: 'circle-dot', label: 'Radio' },
	{ value: 'dropdown', icon: 'chevrons-up-down', label: 'Dropdown' },
	{ value: 'signature', icon: 'signature', label: 'Signature' },
];

const inputValue = (event: Event) =>
	(event.target as HTMLInputElement).value.trim();

/** selected field, else draft */
export default class FormFields extends Component<{ Args: { open: boolean } }> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	selected = new TrackedExternal(subscribeFields, getSelectedField);
	draft = new TrackedExternal(subscribeFields, getFieldDraft);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selected.unsubscribe();
		this.draft.unsubscribe();
	}

	get target(): { pageId: string; field: FieldObject } | null {
		const id = this.selected.current;
		for (const page of this.doc.current?.pages ?? []) {
			const field = page.objects.find((o) => o.id === id);
			if (field?.kind === 'field')
				return { pageId: page.id, field };
		}
		return null;
	}

	get props(): FieldDraft {
		return this.target?.field ?? this.draft.current;
	}

	get optionsText() {
		return this.props.options.join(', ');
	}

	get duplicate() {
		const name = this.props.name;
		const count = (this.doc.current?.pages ?? []).reduce(
			(n, p) =>
				n +
				p.objects.filter(
					(o) =>
						o.kind === 'field' &&
						o.name === name,
				).length,
			0,
		);
		return name !== '' && count > (this.target ? 1 : 0);
	}

	activate = modifier((_el: HTMLElement, [open]: [boolean]) => {
		if (!open) return;
		setActiveTool('field');
		loadSourceWidgets();
		return () => {
			if (getActiveTool() === 'field')
				setActiveTool('select');
		};
	});

	patch = (changes: Partial<FieldDraft>) => {
		const t = this.target;
		if (t) patchObjects(t.pageId, new Map([[t.field.id, changes]]));
		else setFieldDraft(changes);
	};

	setType = (field: FieldType) => this.patch({ field, value: '' });
	setName = (event: Event) => this.patch({ name: inputValue(event) });
	setValue = (event: Event) => this.patch({ value: inputValue(event) });
	setChoice = (value: string) => this.patch({ value });
	setChecked = (on: boolean) => this.patch({ value: on ? 'on' : '' });
	setRequired = (required: boolean) => this.patch({ required });
	setOptions = (event: Event) => {
		const options = parseOptions(inputValue(event));
		this.patch({
			options,
			value: options.includes(this.props.value)
				? this.props.value
				: '',
		});
	};

	<template>
		<Field @label="Type" {{this.activate @open}}>
			<span class="segmented err-mode-seg">
				{{#each TYPES key="value" as |t|}}
					<button
						type="button"
						class="sub-seg-cell
							{{if
								(eq
									this.props.field
									t.value
								)
								'is-active'
							}}"
						aria-label={{t.label}}
						title={{t.label}}
						{{on
							"click"
							(fn
								this.setType
								t.value
							)
						}}
					>
						<Icon @name={{t.icon}} />
					</button>
				{{/each}}
			</span>
		</Field>
		<InputField @label="Name">
			<input
				class="err-mode-input"
				aria-label="Name"
				aria-invalid={{if
					this.duplicate
					"true"
					"false"
				}}
				placeholder={{this.props.field}}
				value={{this.props.name}}
				{{on "change" this.setName}}
			/>
		</InputField>
		{{#if
			(or
				(eq this.props.field "radio")
				(eq this.props.field "dropdown")
			)
		}}
			<InputField @label="Options">
				<input
					class="err-mode-input"
					aria-label="Options"
					placeholder="One, Two"
					value={{this.optionsText}}
					{{on "change" this.setOptions}}
				/>
			</InputField>
			<Field @label="Default">
				<Select
					@value={{this.props.value}}
					@onValueChange={{this.setChoice}}
				>
					<SelectTrigger aria-label="Default">
						<SelectValue>{{if
								this.props.value
								this.props.value
								"None"
							}}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem
							@value=""
						>None</SelectItem>
						{{#each
							this.props.options
							as |o|
						}}
							<SelectItem
								@value={{o}}
							>{{o}}</SelectItem>
						{{/each}}
					</SelectContent>
				</Select>
			</Field>
		{{else if (eq this.props.field "text")}}
			<InputField @label="Default">
				<input
					class="err-mode-input"
					aria-label="Default"
					value={{this.props.value}}
					{{on "change" this.setValue}}
				/>
			</InputField>
		{{else if (eq this.props.field "checkbox")}}
			<InputField @label="Checked">
				<Switch
					@checked={{if
						this.props.value
						true
						false
					}}
					@onChange={{this.setChecked}}
				/>
			</InputField>
		{{/if}}
		<InputField @label="Required">
			<Switch
				@checked={{this.props.required}}
				@onChange={{this.setRequired}}
			/>
		</InputField>
	</template>
}
