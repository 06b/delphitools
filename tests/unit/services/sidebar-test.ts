import { module, test } from 'qunit';
import { setupTest } from 'delphitools-v2/tests/helpers';
import type SidebarService from 'delphitools-v2/services/sidebar';
import type BreakpointService from 'delphitools-v2/services/breakpoint';

const COOKIE = 'sidebar_state';

function clearCookies() {
	for (const pair of document.cookie.split(';')) {
		const name = pair.split('=')[0]?.trim();
		if (name) document.cookie = `${name}=; path=/; max-age=0`;
	}
}

module('Unit | Service | sidebar', function (hooks) {
	setupTest(hooks);

	hooks.beforeEach(clearCookies);
	hooks.afterEach(clearCookies);

	// cookie read in constructor; set before first lookup
	const lookup = (ctx: object) =>
		(
			ctx as { owner: { lookup(n: string): SidebarService } }
		).owner.lookup('service:sidebar');

	test('defaults to expanded when no cookie is set', function (assert) {
		const sidebar = lookup(this);
		assert.true(sidebar.open);
	});

	test('restores the collapsed state from the cookie', function (assert) {
		document.cookie = `${COOKIE}=false; path=/`;
		const sidebar = lookup(this);
		assert.false(sidebar.open);
	});

	test('restores the expanded state from the cookie', function (assert) {
		document.cookie = `${COOKIE}=true; path=/`;
		assert.true(lookup(this).open);
	});

	// cookie parse anchored to boundary; substring decoy test
	test('ignores a different cookie whose name ends in the same suffix', function (assert) {
		document.cookie = `x_${COOKIE}=false; path=/`;
		assert.true(lookup(this).open);
	});

	test('toggle flips the rail and persists it', function (assert) {
		const sidebar = lookup(this);
		sidebar.toggle();
		assert.false(sidebar.open);
		assert.true(document.cookie.includes(`${COOKIE}=false`));
	});

	test('a phone shows the opposite of the wide state', function (assert) {
		document.cookie = `${COOKIE}=false; path=/`;
		const sidebar = lookup(this);
		const breakpoint = (
			this as unknown as {
				owner: { lookup(n: string): BreakpointService };
			}
		).owner.lookup('service:breakpoint');
		breakpoint.current = 'mobile';
		assert.true(sidebar.open);
		sidebar.toggle();
		assert.false(sidebar.open);
		assert.true(document.cookie.includes(`${COOKIE}=true`));
		breakpoint.current = 'desktop';
		assert.true(sidebar.open);
	});
});
