function svg(paths: string, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const ICONS = {
  globe: svg(
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M12 2a14.5 14.5 0 0 1 0 20"/><path d="M2 12h20"/>',
  ),
  arrowLeft: svg('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'),
  arrowRight: svg('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'),
  rotateCw: svg('<path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>', 12),
  x: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
} as const;
