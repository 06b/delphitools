import { tracked } from '@glimmer/tracking';
import {
	loadLayout,
	saveLayout,
} from 'delphitools-v2/lib/substrata/layout-storage';

export type Hand = 'left' | 'right';

export interface RenameTarget {
	id: string;
	name: string;
	// runs once the new name is stored
	after?: () => void;
}

const HAND_KEY = 'canonHand';
const HELP_KEY = 'canonHelpButton';

// the pages' own state: app settings iOS keeps in AppSettings, and what the
// forms anchor to; the modal store still names the open form
class PageState {
	@tracked hand: Hand =
		loadLayout<unknown>(HAND_KEY, 'right') === 'left'
			? 'left'
			: 'right';
	@tracked helpButton = loadLayout<unknown>(HELP_KEY, true) !== false;
	@tracked rename: RenameTarget | null = null;
	// the control a form points at; null points it at the menu cell
	@tracked anchor: HTMLElement | null = null;

	setHand = (hand: Hand): void => {
		this.hand = hand;
		saveLayout(HAND_KEY, hand);
	};

	setHelpButton = (on: boolean): void => {
		this.helpButton = on;
		saveLayout(HELP_KEY, on);
	};

	openRename = (
		target: RenameTarget,
		anchor: HTMLElement | null,
	): void => {
		this.anchor = anchor;
		this.rename = target;
	};

	closeRename = (): void => {
		this.rename = null;
	};
}

export const pageState = new PageState();

// the control a form points at: its opener while it is on screen, else the
// edit stack's menu or share cell
export function anchorFor(
	label: 'Menu' | 'Share',
	own: HTMLElement | null = null,
): HTMLElement | null {
	if (own?.isConnected) return own;
	return document.querySelector<HTMLElement>(
		`.sub-ed-stack [title="${label}"], .sub-ed-phone-stack [title="${label}"]`,
	);
}
