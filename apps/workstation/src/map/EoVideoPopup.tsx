import React from 'react';

// ---------------------------------------------------------------------------
// Compact SVG silhouettes for the popup (scaled to 280x160)
// ---------------------------------------------------------------------------

function AircraftMiniSvg() {
  return (
    <svg viewBox="0 0 280 160" width="280" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="160" fill="#0d0d1a" />
      <ellipse cx="140" cy="80" rx="10" ry="45" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="70" y1="88" x2="210" y2="88" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="88" y1="88" x2="70" y2="96" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="192" y1="88" x2="210" y2="96" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="115" y1="40" x2="165" y2="40" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <circle cx="140" cy="123" r="2.5" fill="#33ff66" opacity="0.6" />
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" y1={40 * i + 20} x2="280" y2={40 * i + 20} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function DroneMiniSvg() {
  return (
    <svg viewBox="0 0 280 160" width="280" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="160" fill="#0d0d1a" />
      <rect x="120" y="65" width="40" height="30" rx="4" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="120" y1="70" x2="85" y2="45" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="160" y1="70" x2="195" y2="45" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="120" y1="90" x2="85" y2="115" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="160" y1="90" x2="195" y2="115" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <circle cx="85" cy="45" r="15" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="195" cy="45" r="15" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="85" cy="115" r="15" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="195" cy="115" r="15" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" y1={40 * i + 20} x2="280" y2={40 * i + 20} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function HelicopterMiniSvg() {
  return (
    <svg viewBox="0 0 280 160" width="280" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="160" fill="#0d0d1a" />
      <ellipse cx="130" cy="85" rx="30" ry="16" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <ellipse cx="160" cy="89" rx="12" ry="10" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      <line x1="100" y1="82" x2="60" y2="66" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="56" y1="54" x2="64" y2="78" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="75" y1="68" x2="210" y2="68" stroke="#33ff66" strokeWidth="1.5" opacity="0.7" />
      <circle cx="140" cy="68" r="2.5" fill="#33ff66" opacity="0.6" />
      <line x1="115" y1="100" x2="115" y2="108" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      <line x1="150" y1="100" x2="150" y2="108" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      <line x1="105" y1="108" x2="160" y2="108" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" y1={40 * i + 20} x2="280" y2={40 * i + 20} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function MissileMiniSvg() {
  return (
    <svg viewBox="0 0 280 160" width="280" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="160" fill="#0d0d1a" />
      <rect x="125" y="30" width="16" height="75" rx="6" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      <polygon points="133,15 125,30 141,30" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      <polygon points="125,98 108,120 125,108" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      <polygon points="141,98 158,120 141,108" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      <line x1="130" y1="110" x2="126" y2="132" stroke="#ff8800" strokeWidth="1" opacity="0.5" />
      <line x1="133" y1="110" x2="133" y2="136" stroke="#ff8800" strokeWidth="1" opacity="0.6" />
      <line x1="136" y1="110" x2="140" y2="132" stroke="#ff8800" strokeWidth="1" opacity="0.5" />
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" y1={40 * i + 20} x2="280" y2={40 * i + 20} stroke="#ff4444" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function UnknownMiniSvg() {
  return (
    <svg viewBox="0 0 280 160" width="280" height="160" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="160" fill="#0d0d1a" />
      <circle cx="140" cy="80" r="20" fill="none" stroke="#ffcc00" strokeWidth="1.5" opacity="0.6" strokeDasharray="6 3" />
      <circle cx="140" cy="80" r="7" fill="#ffcc00" opacity="0.3" />
      <circle cx="140" cy="80" r="2.5" fill="#ffcc00" opacity="0.7" />
      <text x="140" y="50" textAnchor="middle" fill="#ffcc00" opacity="0.4" fontSize="16" fontFamily="monospace">?</text>
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="0" y1={40 * i + 20} x2="280" y2={40 * i + 20} stroke="#ffcc00" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Classification mapping
// ---------------------------------------------------------------------------

const MINI_SVG: Record<string, () => React.JSX.Element> = {
  aircraft: AircraftMiniSvg,
  fighter_aircraft: AircraftMiniSvg,
  civilian_aircraft: AircraftMiniSvg,
  passenger_aircraft: AircraftMiniSvg,
  light_aircraft: AircraftMiniSvg,
  drone: DroneMiniSvg,
  uav: DroneMiniSvg,
  small_uav: DroneMiniSvg,
  helicopter: HelicopterMiniSvg,
  missile: MissileMiniSvg,
  unknown: UnknownMiniSvg,
};

function getMiniSvg(classification: string): () => React.JSX.Element {
  return MINI_SVG[classification] ?? UnknownMiniSvg;
}

function getClassColor(classification: string): string {
  if (classification === 'missile') return '#ff4444';
  if (classification === 'unknown') return '#ffcc00';
  return '#33ff66';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EoVideoPopupProps {
  trackId: string;
  classification: string;
  confidence: number;
  statusColor: string;
  /** Screen position of the track marker */
  trackScreenX: number;
  trackScreenY: number;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EoVideoPopup({
  trackId,
  classification,
  confidence,
  statusColor: borderColor,
  trackScreenX,
  trackScreenY,
  onClose,
}: EoVideoPopupProps) {
  const SvgComponent = getMiniSvg(classification);
  const classColor = getClassColor(classification);
  const displayClassification = classification.replace(/_/g, ' ').toUpperCase();
  const confidencePercent = (confidence * 100).toFixed(0);

  // Popup offset relative to the track
  const popupX = trackScreenX + 60;
  const popupY = trackScreenY - 80;
  const popupWidth = 280;
  const popupHeight = 200;

  // Leader line endpoints: bottom-center of popup to track position
  const lineStartX = popupX + popupWidth / 2;
  const lineStartY = popupY + popupHeight;
  const lineEndX = trackScreenX;
  const lineEndY = trackScreenY;

  // Determine if the EO feed is "active" (green) based on having a classification
  const feedActive = classification !== 'unknown';

  return (
    <>
      {/* Leader line (SVG) */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 24,
          overflow: 'visible',
        }}
      >
        <line
          x1={lineStartX}
          y1={lineStartY}
          x2={lineEndX}
          y2={lineEndY}
          stroke={borderColor}
          strokeWidth="1.5"
          strokeDasharray="4,3"
          opacity="0.7"
        />
        {/* Small circle at the track end */}
        <circle cx={lineEndX} cy={lineEndY} r="4" fill="none" stroke={borderColor} strokeWidth="1.5" opacity="0.7" />
      </svg>

      {/* Popup container */}
      <div
        style={{
          position: 'absolute',
          left: `${popupX}px`,
          top: `${popupY}px`,
          width: `${popupWidth}px`,
          background: 'rgba(26, 26, 46, 0.93)',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
          color: '#e0e0e0',
          fontSize: '11px',
          zIndex: 25,
          pointerEvents: 'auto',
          boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 8px ${borderColor}33`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px',
            background: '#111128',
            borderBottom: `1px solid ${borderColor}44`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: feedActive ? '#00cc44' : '#ff8800',
                boxShadow: feedActive ? '0 0 4px #00cc44' : '0 0 4px #ff8800',
              }}
            />
            <span style={{ color: '#ff8800', fontSize: '9px', fontWeight: 700, letterSpacing: '1px' }}>
              EO FEED
            </span>
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600 }}>
              {trackId.includes('-') ? trackId.slice(0, 8) : trackId}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              background: 'none',
              color: '#888',
              border: '1px solid #333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '1',
              padding: '1px 5px',
              fontWeight: 700,
            }}
            title="Close EO video popup"
          >
            x
          </button>
        </div>

        {/* Silhouette image area */}
        <div style={{ width: '280px', height: '160px', position: 'relative', overflow: 'hidden' }}>
          <SvgComponent />
        </div>

        {/* Bottom info bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            background: '#0a0a1a',
            borderTop: `1px solid ${borderColor}22`,
          }}
        >
          <span style={{
            padding: '1px 6px',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: 600,
            background: classColor + '22',
            color: classColor,
            border: `1px solid ${classColor}44`,
            fontFamily: '"Fira Code", "Consolas", monospace',
          }}>
            {displayClassification}
          </span>
          <span style={{
            fontSize: '10px',
            color: '#aaa',
            fontFamily: '"Fira Code", "Consolas", monospace',
          }}>
            {confidencePercent}% conf
          </span>
        </div>
      </div>
    </>
  );
}
