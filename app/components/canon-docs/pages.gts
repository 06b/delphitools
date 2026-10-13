import type { TOC } from '@ember/component/template-only';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { IconSvg } from 'delphitools-v2/components/icon';
import { blockParts } from 'delphitools-v2/components/canon-docs/blocks/index';
import { tiles } from 'delphitools-v2/components/canon-docs/tiles';
import type { DocsGo } from 'delphitools-v2/components/canon-docs/docs';
import platforms from 'delphitools-v2/lib/canon-platforms.json';
import {
	componentGroups,
	componentNames,
	docsBlocks,
	docsPages,
	importLine,
	type DocsPage,
} from 'delphitools-v2/lib/canon-docs';

// ∑CG: Canon docs overview, lede under the kit name
//   spec: one or two sentences, ≤ 200 chars, plain, says what the kit is (the delphitools look as components for the web and iOS)
//   sample: "The components behind delphitools, built for the web and for iOS from one design."
const LEDE = '∑CG';

// ∑CG: Canon docs installation page, not-yet-published note
//   spec: one sentence, ≤ 90 chars, plain, says the kit has no public package yet
//   sample: "The kit is not published yet; it ships inside delphitools for now."
const INSTALL_NOTE = '∑CG';

const KIT_NAME = "Delphi's Canon UI Kit";
const PORTS = ['Ember', 'React', 'Vue', 'Svelte', 'UIKit'];
const LIBRARY_LINE = "import { hex } from 'delphicanon/lib/colour';";
const SERVICE_LINE =
	"export { default } from 'delphicanon/services/canon-toast';";

const tileByName = new Map(tiles.map((tile) => [tile.name, tile]));
const tileOf = (name: string) => tileByName.get(name);
const portList = (name: string) => {
	const has = (platforms as Record<string, string[]>)[name] ?? [];
	return PORTS.map((port) => ({ port, has: has.includes(port) }));
};

const groups = componentGroups.map((group) => ({
	title: group.title,
	pages: docsPages.filter(
		(page) =>
			page.kind === 'component' &&
			group.names.includes(page.name),
	),
}));
const blockPages = docsPages.filter((page) => page.kind === 'block');
const linkPages = docsPages.filter((page) =>
	['installation', 'components', 'blocks'].includes(page.id),
);

const counts = [
	{ label: 'Components', value: String(componentNames.length) },
	{ label: 'Blocks', value: String(docsBlocks.length) },
];

const Links: TOC<{ Args: { pages: DocsPage[]; go: DocsGo } }> = <template>
	<div class="cd-links">
		{{#each @pages as |page|}}
			<CanonSidebarRow
				@title={{page.heading}}
				@icon={{component IconSvg name=page.icon}}
				@href={{page.url}}
				@onClick={{@go}}
			/>
		{{/each}}
	</div>
</template>;

const Overview: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{KIT_NAME}}</h1>
		<p class="cd-lede">{{LEDE}}</p>
	</header>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Platforms" />
		<CanonRow
			@title="The Web"
			@detail="Ember, React, Vue, Svelte"
		/>
		<CanonRow @title="UIKit" />
		<CanonRow @title="Jetpack Compose">
			<CanonStatus @text="Planned" @tone="muted" />
		</CanonRow>
	</CanonRows>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Contents" />
		<CanonTiles @items={{counts}} />
	</CanonRows>
	<Links @pages={{linkPages}} @go={{@go}} />
</template>;

const Installation: TOC<object> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Installation</h1>
		<p class="cd-lede">{{INSTALL_NOTE}}</p>
	</header>
	<CanonRows class="cd-import" @framed={{true}}>
		<CanonHeading @text="Imports" />
		<CanonValueLine
			@label="Component"
			@value={{importLine "canon-slider"}}
			@layout="wrapping"
		/>
		<CanonValueLine
			@label="Library"
			@value={{LIBRARY_LINE}}
			@layout="wrapping"
		/>
		<CanonValueLine
			@label="Service"
			@value={{SERVICE_LINE}}
			@layout="wrapping"
		/>
	</CanonRows>
</template>;

const Components: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Components</h1>
	</header>
	{{#each groups as |group|}}
		<CanonRows @framed={{true}}>
			<CanonHeading @text={{group.title}} />
			<Links @pages={{group.pages}} @go={{@go}} />
		</CanonRows>
	{{/each}}
</template>;

const ComponentPage: TOC<{ Args: { page: DocsPage } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{@page.heading}}</h1>
	</header>
	{{#let (tileOf @page.name) as |tile|}}
		{{#if tile}}
			<CanonRows class="cd-demo" @framed={{true}}>
				<CanonHeading @text="Example" />
				<tile.Live />
			</CanonRows>
		{{/if}}
	{{/let}}
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Usage" />
		<CanonValueLine
			class="cd-import"
			@label="Import"
			@value={{importLine @page.name}}
			@layout="wrapping"
		/>
	</CanonRows>
	<CanonRows @framed={{true}}>
		<CanonHeading @text="Platforms" />
		<div class="cd-ports">
			{{#each (portList @page.name) as |entry|}}
				<CanonStatus
					@text={{entry.port}}
					@tone={{if entry.has "ok" "muted"}}
					data-has={{if entry.has "true" "false"}}
				/>
			{{/each}}
		</div>
	</CanonRows>
</template>;

const Blocks: TOC<{ Args: { go: DocsGo } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">Blocks</h1>
	</header>
	<Links @pages={{blockPages}} @go={{@go}} />
</template>;

const blockOf = (name: string) => blockParts[name];

const BlockPage: TOC<{ Args: { page: DocsPage } }> = <template>
	<header class="cd-head">
		<h1 class="cd-title">{{@page.heading}}</h1>
	</header>
	{{#let (blockOf @page.name) as |block|}}
		{{#if block}}
			<div class="cd-block">
				<block.Live />
			</div>
			<CanonCodeBlock
				class="cd-source"
				@code={{block.source}}
				@language="gts"
				@maxHeight={{560}}
			/>
		{{/if}}
	{{/let}}
</template>;

const eq = (a: unknown, b: unknown) => a === b;

/** The pane's content for one docs page. */
const DocsBody: TOC<{ Args: { page: DocsPage; go: DocsGo } }> = <template>
	{{#if (eq @page.kind "overview")}}
		<Overview @go={{@go}} />
	{{else if (eq @page.kind "installation")}}
		<Installation />
	{{else if (eq @page.kind "components")}}
		<Components @go={{@go}} />
	{{else if (eq @page.kind "component")}}
		<ComponentPage @page={{@page}} />
	{{else if (eq @page.kind "blocks")}}
		<Blocks @go={{@go}} />
	{{else}}
		<BlockPage @page={{@page}} />
	{{/if}}
</template>;

export default DocsBody;
