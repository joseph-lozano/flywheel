// Shared dot-grid divider for panel title bars.
// Idle: static indigo dots. Busy: scale+glow sparkle animation.

export const DOT_GRID_SVG = `<svg class="dot-grid" width="10" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <circle cx="9" cy="5" r="1.5"/>
  <circle cx="15" cy="5" r="1.5"/>
  <circle cx="9" cy="12" r="1.5"/>
  <circle cx="15" cy="12" r="1.5"/>
  <circle cx="9" cy="19" r="1.5"/>
  <circle cx="15" cy="19" r="1.5"/>
</svg>`

export const DOT_GRID_CSS = `
.dot-grid-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin: 0 5px;
  color: #6366f1;
  opacity: 0.5;
}
.dot-grid circle {
  transform-origin: var(--cx) var(--cy);
}
.dot-grid circle:nth-child(1) { --cx: 9px; --cy: 5px; }
.dot-grid circle:nth-child(2) { --cx: 15px; --cy: 5px; }
.dot-grid circle:nth-child(3) { --cx: 9px; --cy: 12px; }
.dot-grid circle:nth-child(4) { --cx: 15px; --cy: 12px; }
.dot-grid circle:nth-child(5) { --cx: 9px; --cy: 19px; }
.dot-grid circle:nth-child(6) { --cx: 15px; --cy: 19px; }
.dot-grid-wrap.busy { opacity: 1; }
.dot-grid-wrap.busy circle {
  animation: dot-sparkle 1.5s ease-in-out infinite;
  will-change: transform, opacity;
}
.dot-grid-wrap.busy circle:nth-child(1) { animation-delay: 0s; }
.dot-grid-wrap.busy circle:nth-child(2) { animation-delay: 0.5s; }
.dot-grid-wrap.busy circle:nth-child(3) { animation-delay: 0.22s; }
.dot-grid-wrap.busy circle:nth-child(4) { animation-delay: 0.82s; }
.dot-grid-wrap.busy circle:nth-child(5) { animation-delay: 0.37s; }
.dot-grid-wrap.busy circle:nth-child(6) { animation-delay: 0.67s; }
@keyframes dot-sparkle {
  0%, 100% { opacity: 0.2; fill: #6366f1; transform: scale(1); }
  30% { opacity: 1; fill: #a5b4fc; transform: scale(1.5); }
  60% { opacity: 0.2; fill: #6366f1; transform: scale(1); }
}
`

export function initDotGrid(wrap: HTMLElement): void {
  wrap.className = 'dot-grid-wrap'
  wrap.innerHTML = DOT_GRID_SVG
  const style = document.createElement('style')
  style.textContent = DOT_GRID_CSS
  document.head.appendChild(style)
}

export function setDotGridBusy(wrap: HTMLElement, busy: boolean): void {
  wrap.classList.toggle('busy', busy)
}
