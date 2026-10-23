import { htmlSafe } from '@ember/template';
import apple from './apple.svg?raw';
import ember from './emberdotjs.svg?raw';
import compose from './jetpackcompose.svg?raw';
import react from './react.svg?raw';
import svelte from './svelte.svg?raw';
import vue from './vuedotjs.svg?raw';

// Simple Icons 16.35.0 (simpleicons.org, CC0); UIKit takes Apple's mark
export const brands: Record<string, ReturnType<typeof htmlSafe>> = {
	Ember: htmlSafe(ember),
	React: htmlSafe(react),
	Vue: htmlSafe(vue),
	Svelte: htmlSafe(svelte),
	UIKit: htmlSafe(apple),
	'Jetpack Compose': htmlSafe(compose),
};
