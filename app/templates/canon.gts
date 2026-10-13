import RouteTemplate from 'ember-route-template';
import type { ComponentLike } from '@glint/template';

export default RouteTemplate<{ Args: { model: ComponentLike } }>(
	<template><@model /></template>,
);
