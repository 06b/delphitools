import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonMathEditor from 'delphicanon/components/canon-math-editor';
import CanonMathKeypad from 'delphicanon/components/canon-math-keypad';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { MathEditing } from 'delphicanon/lib/math/editing';
import { Expression } from 'delphicanon/lib/math/expression';

const start = 'sqrt(x^2+1)/(2*x)';

export default class EquationPattern extends Component {
	@tracked text = start;

	editing = new MathEditing(
		new Expression(start),
		(text) => (this.text = text),
	);

	<template>
		<div class="cd-editor">
			<CanonMathEditor
				@editing={{this.editing}}
				@size={{26}}
			/>
		</div>
		<CanonMathKeypad
			@short={{true}}
			@onKey={{this.editing.apply}}
		/>
		<CanonValueLine @label="Text" @value={{this.text}} />
	</template>
}
