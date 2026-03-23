/**
 * Ctrl+Left-click+drag rectangle zoom for MapAdapter-wrapped maps.
 * Works with both MapLibre and Leaflet via the MapAdapter interface.
 */
import type { MapAdapter } from './map-adapter';

export function enableCtrlBoxZoom(adapter: MapAdapter): () => void {
  const container = adapter.getContainer();
  let startPoint: { x: number; y: number } | null = null;
  let box: HTMLDivElement | null = null;
  let active = false;

  // Suppress context menu while Ctrl is held (prevents right-click menu during box zoom)
  const onContextMenu = (e: MouseEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };

  const onMouseDown = (e: MouseEvent) => {
    // Ctrl + right-click (button 2) starts box zoom
    if (!e.ctrlKey || e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();

    // Disable map drag while box-zooming
    adapter.disableDragPan();

    const rect = container.getBoundingClientRect();
    startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    active = true;

    box = document.createElement('div');
    box.style.cssText = `
      position: absolute;
      border: 2px dashed #ffffff;
      background: rgba(255, 255, 255, 0.1);
      pointer-events: none;
      z-index: 100;
    `;
    container.appendChild(box);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!active || !startPoint || !box) return;
    e.preventDefault();

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const left = Math.min(startPoint.x, x);
    const top = Math.min(startPoint.y, y);
    const width = Math.abs(x - startPoint.x);
    const height = Math.abs(y - startPoint.y);

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!active || !startPoint) return;

    const rect = container.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    // Clean up box
    if (box) {
      box.remove();
      box = null;
    }
    active = false;

    // Re-enable drag
    adapter.enableDragPan();

    // Only zoom if box is at least 10px in each dimension
    const width = Math.abs(endX - startPoint.x);
    const height = Math.abs(endY - startPoint.y);
    if (width < 10 || height < 10) {
      startPoint = null;
      return;
    }

    // Convert pixel corners to lngLat and fit bounds
    const sw = adapter.unproject([
      Math.min(startPoint.x, endX),
      Math.max(startPoint.y, endY),
    ]);
    const ne = adapter.unproject([
      Math.max(startPoint.x, endX),
      Math.min(startPoint.y, endY),
    ]);

    adapter.fitBounds([[sw.lng, sw.lat], [ne.lng, ne.lat]], { padding: 20, duration: 300 });
    startPoint = null;
  };

  const onKeyUp = (e: KeyboardEvent) => {
    // Cancel box zoom if Ctrl released mid-drag
    if (e.key === 'Control' && active) {
      if (box) {
        box.remove();
        box = null;
      }
      active = false;
      startPoint = null;
      adapter.enableDragPan();
    }
  };

  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keyup', onKeyUp);
    if (box) box.remove();
  };
}
