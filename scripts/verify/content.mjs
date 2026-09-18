// run with bun: bun scripts/verify/content.mjs <pdf...>   (parses page content streams, no browser)
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { readPageContent, groupLines } from '../../app/lib/errata/content/interpret.ts';
import { tokenise, writeOps } from '../../app/lib/errata/content/tokens.ts';

const files = process.argv.slice(2);
const verbose = process.env.VERBOSE === '1';
let pages = 0, failed = 0;
const totals = { text: 0, image: 0, form: 0, path: 0, lines: 0, warnings: 0, roundtrip: 0 };
for (const file of files) {
	const t0 = performance.now();
	let doc;
	try {
		doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true, updateMetadata: false });
	} catch (e) {
		console.log(`FAIL load ${file}: ${e.message}`);
		failed++;
		continue;
	}
	const counts = { text: 0, image: 0, form: 0, path: 0, lines: 0, warnings: 0, roundtrip: 0 };
	const warn = new Set();
	for (const [i, page] of doc.getPages().entries()) {
		pages++;
		try {
			const c = readPageContent(page);
			for (const it of c.items) counts[it.kind]++;
			counts.lines += groupLines(c.items).length;
			counts.warnings += c.warnings.length;
			for (const w of c.warnings) warn.add(w);
			const again = tokenise(writeOps(c.ops));
			if (again.length !== c.ops.length || again.some((o, k) => o.op !== c.ops[k].op || o.args.length !== c.ops[k].args.length))
				counts.roundtrip++;
			if (verbose && i === 0)
				for (const l of groupLines(c.items).slice(0, 8))
					console.log(`   ${l.bbox.x0.toFixed(0)},${l.bbox.y0.toFixed(0)} ${l.runs[0].font.baseFont} ${l.runs[0].size} ${JSON.stringify(l.text.slice(0, 60))}`);
		} catch (e) {
			console.log(`FAIL ${file} p${i + 1}: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
			failed++;
		}
	}
	for (const k in counts) totals[k] += counts[k];
	const ms = (performance.now() - t0).toFixed(0);
	console.log(`${doc.getPageCount()}p ${ms}ms text=${counts.text} lines=${counts.lines} img=${counts.image} form=${counts.form} path=${counts.path} warn=${counts.warnings} rt=${counts.roundtrip} ${file.split('/').pop()}`);
	for (const w of [...warn].slice(0, 3)) console.log(`   warn: ${w}`);
}
console.log(`\n${pages} pages, ${failed} failures`, totals);
process.exit(failed ? 1 : 0);
