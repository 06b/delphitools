import { IconSvg } from 'delphitools-v2/components/icon';

/** The iOS PDFStampEngine.Anchor labels, in ANCHORS order. */
export const ANCHOR_NAMES = [
	'Top left',
	'Top centre',
	'Top right',
	'Middle left',
	'Centre',
	'Middle right',
	'Bottom left',
	'Bottom centre',
	'Bottom right',
];

export const ANCHOR_ICONS = [
	<template><IconSvg @name="arrow-up-left" /></template>,
	<template><IconSvg @name="arrow-up" /></template>,
	<template><IconSvg @name="arrow-up-right" /></template>,
	<template><IconSvg @name="arrow-left" /></template>,
	<template><IconSvg @name="dot" /></template>,
	<template><IconSvg @name="arrow-right" /></template>,
	<template><IconSvg @name="arrow-down-left" /></template>,
	<template><IconSvg @name="arrow-down" /></template>,
	<template><IconSvg @name="arrow-down-right" /></template>,
];
