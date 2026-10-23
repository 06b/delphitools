import { icons } from 'delphitools-v2/lib/icons';
import appWindow from 'lucide-static/icons/app-window.svg?raw';
import blocks from 'lucide-static/icons/blocks.svg?raw';
import box from 'lucide-static/icons/box.svg?raw';
import bug from 'lucide-static/icons/bug.svg?raw';
import caseSensitive from 'lucide-static/icons/case-sensitive.svg?raw';
import columns2 from 'lucide-static/icons/columns-2.svg?raw';
import command from 'lucide-static/icons/command.svg?raw';
import file from 'lucide-static/icons/file.svg?raw';
import keyboard from 'lucide-static/icons/keyboard.svg?raw';
import menu from 'lucide-static/icons/menu.svg?raw';
import messageSquareCheck from 'lucide-static/icons/message-square-check.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import moveHorizontal from 'lucide-static/icons/move-horizontal.svg?raw';
import packageSvg from 'lucide-static/icons/package.svg?raw';
import share from 'lucide-static/icons/share.svg?raw';
import squareRadical from 'lucide-static/icons/square-radical.svg?raw';
import sigma from 'lucide-static/icons/sigma.svg?raw';
import text from 'lucide-static/icons/text.svg?raw';

// docs-only icons join the shared map when the docs chunk loads, so the
// main chunk does not carry them (scripts/verify/static.mjs checks its size)
Object.assign(icons, {
	'app-window': appWindow,
	blocks,
	box,
	bug,
	'case-sensitive': caseSensitive,
	'columns-2': columns2,
	command,
	file,
	keyboard,
	menu,
	'message-square-check': messageSquareCheck,
	monitor,
	'move-horizontal': moveHorizontal,
	package: packageSvg,
	share,
	'square-radical': squareRadical,
	sigma,
	text,
});
