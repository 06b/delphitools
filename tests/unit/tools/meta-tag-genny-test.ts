import { module, test } from 'qunit';
import {
	cut,
	generateMetaTags,
	host,
	imageLabel,
	trail,
	type MetaFields,
} from 'delphitools-v2/components/tools/meta-tag-genny/tags';

const blank: MetaFields = {
	title: '',
	description: '',
	keywords: '',
	author: '',
	url: '',
	image: '',
	siteName: '',
	twitterHandle: '',
	ogType: 'website',
	twitterCard: 'summary_large_image',
};

module('Unit | Tool | meta-tag-genny', function () {
	test('host: no www, empty for a broken address', function (assert) {
		assert.strictEqual(
			host('https://www.example.org/a'),
			'example.org',
		);
		assert.strictEqual(
			host('https://delphi.tools/tools/x'),
			'delphi.tools',
		);
		assert.strictEqual(host('nope'), '');
		assert.strictEqual(host(''), '');
	});

	test('trail: host, then the path parts', function (assert) {
		assert.strictEqual(
			trail('https://example.com/notes/today'),
			'https://example.com › notes › today',
		);
		assert.strictEqual(trail(''), '');
	});

	test('cut: at the last word break with an ellipsis', function (assert) {
		assert.strictEqual(cut('short', 60), 'short');
		assert.strictEqual(cut('one two three', 9), 'one two …');
		assert.strictEqual(cut('one, two three', 9), 'one, two …');
		assert.strictEqual(cut('one two, three', 9), 'one two …');
	});

	test('imageLabel: the file name, else the size the card wants', function (assert) {
		assert.strictEqual(
			imageLabel('https://example.com/images/a.jpg', true),
			'a.jpg',
		);
		assert.strictEqual(imageLabel('', true), '1200 × 630');
		assert.strictEqual(
			imageLabel('https://example.com/', false),
			'144 × 144',
		);
	});

	test('empty fields still give the type and the card', function (assert) {
		assert.strictEqual(
			generateMetaTags(blank),
			[
				'',
				'<!-- Open Graph -->',
				'<meta property="og:type" content="website">',
				'',
				'<!-- Twitter Card -->',
				'<meta name="twitter:card" content="summary_large_image">',
			].join('\n'),
		);
	});

	test('every field lands in its tags, escaped', function (assert) {
		const tags = generateMetaTags({
			...blank,
			title: 'A "quoted" <b>',
			keywords: 'a, b',
			author: 'R',
			url: 'https://e.com/?a=1&b=2',
			image: 'https://e.com/i.png',
			siteName: 'Site',
			twitterHandle: '@me',
			ogType: 'article',
			twitterCard: 'summary',
		});
		for (const line of [
			'<title>A &quot;quoted&quot; &lt;b&gt;</title>',
			'<meta name="title" content="A &quot;quoted&quot; &lt;b&gt;">',
			'<meta name="keywords" content="a, b">',
			'<meta name="author" content="R">',
			'<link rel="canonical" href="https://e.com/?a=1&amp;b=2">',
			'<meta property="og:type" content="article">',
			'<meta property="og:url" content="https://e.com/?a=1&amp;b=2">',
			'<meta property="og:image" content="https://e.com/i.png">',
			'<meta property="og:site_name" content="Site">',
			'<meta name="twitter:card" content="summary">',
			'<meta name="twitter:url" content="https://e.com/?a=1&amp;b=2">',
			'<meta name="twitter:creator" content="@me">',
		])
			assert.true(tags.includes(line), line);
	});
});
