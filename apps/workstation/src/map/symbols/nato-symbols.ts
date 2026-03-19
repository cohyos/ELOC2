/**
 * NATO APP-6D / MIL-STD-2525 simplified military symbology.
 *
 * Returns inline SVG strings for track and sensor markers.
 * All symbols use a 2px white outline for contrast against dark maps.
 */

// ─── Affiliation frames ─────────────────────────────────────────────────────

export type Affiliation = 'hostile' | 'unknown' | 'assumed_friend' | 'pending';
export type TrackType = 'fighter' | 'uav' | 'helicopter' | 'missile' | 'unknown';
export type SensorSymbolType = 'radar' | 'eo_gimbal' | 'eo_staring' | 'c4isr';

export interface TrackSymbolOptions {
  size?: number;
  color?: string;
  selected?: boolean;
  heading?: number;
  affiliation: Affiliation;
  trackType: TrackType;
}

export interface SensorSymbolOptions {
  size?: number;
  color?: string;
  selected?: boolean;
  heading?: number;
  sensorType: SensorSymbolType;
  online?: boolean;
}

// ─── Track frame paths ──────────────────────────────────────────────────────

/**
 * Hostile: diamond (rotated square).
 * The diamond is inscribed in the viewBox so points touch edges.
 */
function hostileDiamond(s: number, fill: string, strokeColor: string): string {
  const h = s / 2;
  return `<polygon points="${h},1 ${s - 1},${h} ${h},${s - 1} 1,${h}"
    fill="${fill}" stroke="${strokeColor}" stroke-width="2"/>`;
}

/**
 * Unknown: rectangle with curved top/bottom (quatrefoil-like per APP-6).
 * Simplified as a rounded rectangle.
 */
function unknownRect(s: number, fill: string, strokeColor: string): string {
  const r = s * 0.2;
  return `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="${r}" ry="${r}"
    fill="${fill}" stroke="${strokeColor}" stroke-width="2"/>`;
}

/**
 * Assumed friend: rectangle (APP-6 friendly frame).
 */
function friendlyRect(s: number, fill: string, strokeColor: string): string {
  return `<rect x="2" y="2" width="${s - 4}" height="${s - 4}"
    fill="${fill}" stroke="${strokeColor}" stroke-width="2"/>`;
}

/**
 * Pending: circle (default/backwards-compatible).
 */
function pendingCircle(s: number, fill: string, strokeColor: string): string {
  const h = s / 2;
  return `<circle cx="${h}" cy="${h}" r="${h - 2}"
    fill="${fill}" stroke="${strokeColor}" stroke-width="2"/>`;
}

// ─── Track type modifier icons ──────────────────────────────────────────────

function fighterIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  // Simple airplane silhouette: fuselage + swept wings + tail
  const scale = s / 24;
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="0" y1="-6" x2="0" y2="6" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="-6" y1="0" x2="6" y2="0" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="-3" y1="5" x2="3" y2="5" stroke="white" stroke-width="1" stroke-linecap="round"/>
  </g>`;
}

function uavIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Quad-rotor: 4 small circles + cross
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="-4" y1="-4" x2="4" y2="4" stroke="white" stroke-width="1"/>
    <line x1="4" y1="-4" x2="-4" y2="4" stroke="white" stroke-width="1"/>
    <circle cx="-4" cy="-4" r="2" fill="none" stroke="white" stroke-width="0.8"/>
    <circle cx="4" cy="-4" r="2" fill="none" stroke="white" stroke-width="0.8"/>
    <circle cx="-4" cy="4" r="2" fill="none" stroke="white" stroke-width="0.8"/>
    <circle cx="4" cy="4" r="2" fill="none" stroke="white" stroke-width="0.8"/>
  </g>`;
}

function helicopterIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Simplified rotor: horizontal line + small circle + body
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="-6" y1="-2" x2="6" y2="-2" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="0" cy="-2" r="1.5" fill="white"/>
    <line x1="0" y1="-2" x2="0" y2="5" stroke="white" stroke-width="1.5"/>
    <line x1="-3" y1="5" x2="3" y2="5" stroke="white" stroke-width="1" stroke-linecap="round"/>
  </g>`;
}

function missileIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Upward arrow/chevron
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="0" y1="-6" x2="0" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="-3,-2 0,-6 3,-2" fill="none" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="-2" y1="5" x2="2" y2="5" stroke="white" stroke-width="1"/>
  </g>`;
}

function unknownTypeIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <text x="0" y="1" text-anchor="middle" dominant-baseline="central"
      font-size="10" font-weight="bold" fill="white" font-family="monospace">?</text>
  </g>`;
}

// ─── Sensor icons ───────────────────────────────────────────────────────────

function radarIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Radar dish/fan: arc lines radiating outward
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="0" y1="5" x2="0" y2="-2" stroke="white" stroke-width="1.5"/>
    <path d="M-5,-3 A7,7 0 0,1 5,-3" fill="none" stroke="white" stroke-width="1.2"/>
    <path d="M-3,-5 A5,5 0 0,1 3,-5" fill="none" stroke="white" stroke-width="1"/>
  </g>`;
}

function eoGimbalIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Camera/eye icon: lens circle + housing
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <circle cx="0" cy="0" r="3" fill="none" stroke="white" stroke-width="1.2"/>
    <circle cx="0" cy="0" r="1" fill="white"/>
    <rect x="-5" y="-4" width="10" height="8" rx="1" fill="none" stroke="white" stroke-width="0.8"/>
  </g>`;
}

function eoStaringIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Wide-angle lens: wider rectangle + large arc
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <path d="M-5,3 Q0,-6 5,3" fill="none" stroke="white" stroke-width="1.2"/>
    <rect x="-5" y="1" width="10" height="5" rx="1" fill="none" stroke="white" stroke-width="0.8"/>
    <circle cx="0" cy="0" r="1.5" fill="white"/>
  </g>`;
}

function c4isrIcon(s: number): string {
  const cx = s / 2;
  const cy = s / 2;
  const scale = s / 24;
  // Antenna: vertical line + radiating waves
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <line x1="0" y1="6" x2="0" y2="-3" stroke="white" stroke-width="1.5"/>
    <circle cx="0" cy="-3" r="1.5" fill="white"/>
    <path d="M-4,-5 A5,5 0 0,1 4,-5" fill="none" stroke="white" stroke-width="0.8"/>
    <path d="M-6,-6 A8,8 0 0,1 6,-6" fill="none" stroke="white" stroke-width="0.6"/>
  </g>`;
}

// ─── Exported symbol generators ─────────────────────────────────────────────

/**
 * Generate an SVG string for a track symbol.
 */
export function trackSymbolSvg(opts: TrackSymbolOptions): string {
  const s = opts.size ?? 24;
  const { affiliation, trackType, selected, heading } = opts;

  // Determine frame fill and stroke colors
  let frameFill: string;
  let frameStroke: string;

  switch (affiliation) {
    case 'hostile':
      frameFill = opts.color ?? 'rgba(255, 50, 50, 0.6)';
      frameStroke = opts.color ?? '#ff3333';
      break;
    case 'unknown':
      frameFill = opts.color ?? 'rgba(255, 204, 0, 0.5)';
      frameStroke = opts.color ?? '#ffcc00';
      break;
    case 'assumed_friend':
      frameFill = opts.color ?? 'rgba(68, 136, 255, 0.5)';
      frameStroke = opts.color ?? '#4488ff';
      break;
    case 'pending':
    default:
      frameFill = opts.color ?? 'rgba(255, 204, 0, 0.4)';
      frameStroke = opts.color ?? '#ffcc00';
      break;
  }

  // Build frame
  let frame: string;
  switch (affiliation) {
    case 'hostile':
      frame = hostileDiamond(s, frameFill, frameStroke);
      break;
    case 'unknown':
      frame = unknownRect(s, frameFill, frameStroke);
      break;
    case 'assumed_friend':
      frame = friendlyRect(s, frameFill, frameStroke);
      break;
    case 'pending':
    default:
      frame = pendingCircle(s, frameFill, frameStroke);
      break;
  }

  // Build type modifier
  let modifier: string;
  switch (trackType) {
    case 'fighter':
      modifier = fighterIcon(s);
      break;
    case 'uav':
      modifier = uavIcon(s);
      break;
    case 'helicopter':
      modifier = helicopterIcon(s);
      break;
    case 'missile':
      modifier = missileIcon(s);
      break;
    case 'unknown':
    default:
      modifier = unknownTypeIcon(s);
      break;
  }

  // Selection ring
  const selectionRing = selected
    ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 + 2}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="3,2"/>`
    : '';

  // White outline for contrast (behind the frame)
  const outline = affiliation === 'hostile'
    ? `<polygon points="${s / 2},0 ${s},${s / 2} ${s / 2},${s} 0,${s / 2}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.5"/>`
    : affiliation === 'unknown' || affiliation === 'pending'
      ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.5"/>`
      : `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.5"/>`;

  const rotation = heading != null ? `transform="rotate(${heading}, ${s / 2}, ${s / 2})"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${selectionRing}
    <g ${rotation}>
      ${outline}
      ${frame}
      ${modifier}
    </g>
  </svg>`;
}

/**
 * Generate an SVG string for a sensor symbol.
 */
export function sensorSymbolSvg(opts: SensorSymbolOptions): string {
  const s = opts.size ?? 24;
  const { sensorType, selected, online = true } = opts;

  let fillColor: string;
  switch (sensorType) {
    case 'radar':
      fillColor = opts.color ?? '#4488ff';
      break;
    case 'eo_gimbal':
    case 'eo_staring':
      fillColor = opts.color ?? '#ff8800';
      break;
    case 'c4isr':
      fillColor = opts.color ?? '#aa44ff';
      break;
    default:
      fillColor = opts.color ?? '#888888';
  }

  const opacity = online ? 1 : 0.4;

  // Rectangle frame with rounded corners
  const frame = `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="2" ry="2"
    fill="${fillColor}" fill-opacity="0.3" stroke="${fillColor}" stroke-width="2"/>`;

  // White outline
  const outline = `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="3" ry="3"
    fill="none" stroke="white" stroke-width="2.5" stroke-opacity="0.4"/>`;

  // Icon
  let icon: string;
  switch (sensorType) {
    case 'radar':
      icon = radarIcon(s);
      break;
    case 'eo_gimbal':
      icon = eoGimbalIcon(s);
      break;
    case 'eo_staring':
      icon = eoStaringIcon(s);
      break;
    case 'c4isr':
      icon = c4isrIcon(s);
      break;
    default:
      icon = '';
  }

  const selectionRing = selected
    ? `<rect x="0" y="0" width="${s}" height="${s}" rx="4" ry="4" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="3,2"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" opacity="${opacity}">
    ${selectionRing}
    ${outline}
    ${frame}
    ${icon}
  </svg>`;
}
