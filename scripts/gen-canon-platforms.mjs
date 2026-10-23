// Writes app/lib/canon-platforms.json: which kit ports have each component.
// Ember is src/components/<name>.gts; React, Vue and Svelte are a file named
// <name> in ports/<framework>/src/components; UIKit is a Swift type
// Canon<Name> (or Canon<Name>View, Canon<Name>ViewController) in
// ports/uikit/Sources. Rerun after the kit gains or loses a component:
//   node scripts/gen-canon-platforms.mjs [path to delphicanon]

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kit = process.argv[2] ?? join(root, 'node_modules/delphicanon');
const out = join(root, 'app/lib/canon-platforms.json');

const stems = (dir) =>
	new Set(readdirSync(dir).map((file) => file.replace(/\..*$/, '')));

const kebab = (type) =>
	type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function swiftTypes(dir) {
	const names = new Set();
	for (const entry of readdirSync(dir, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!entry.isFile() || !entry.name.endsWith('.swift')) continue;
		const text = readFileSync(
			join(entry.parentPath, entry.name),
			'utf8',
		);
		for (const [, type] of text.matchAll(
			/\b(?:class|struct|enum)\s+(Canon[A-Za-z]+)/g,
		)) {
			names.add(kebab(type));
			names.add(
				kebab(
					type.replace(
						/(ViewController|View)$/,
						'',
					),
				),
			);
		}
	}
	return names;
}

const ember = [...stems(join(kit, 'src/components'))]
	.filter((name) => name.startsWith('canon-'))
	.sort();
const ports = {
	React: stems(join(kit, 'ports/react/src/components')),
	Vue: stems(join(kit, 'ports/vue/src/components')),
	Svelte: stems(join(kit, 'ports/svelte/src/components')),
	UIKit: swiftTypes(join(kit, 'ports/uikit/Sources')),
};

const table = Object.fromEntries(
	ember.map((name) => [
		name,
		[
			'Ember',
			...Object.entries(ports)
				.filter(([, names]) => names.has(name))
				.map(([port]) => port),
		],
	]),
);

writeFileSync(out, JSON.stringify(table));
execFileSync('bunx', ['prettier', '--write', out], { stdio: 'ignore' });
console.log(`${ember.length} components -> ${out}`);
