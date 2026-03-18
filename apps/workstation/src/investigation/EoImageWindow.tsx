import React from 'react';

// ---------------------------------------------------------------------------
// SVG silhouettes per classification
// ---------------------------------------------------------------------------

function AircraftSvg() {
  return (
    <svg viewBox="0 0 320 240" width="320" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#0d0d1a" />
      {/* Fuselage */}
      <ellipse cx="160" cy="120" rx="12" ry="60" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Wings */}
      <line x1="80" y1="130" x2="240" y2="130" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="100" y1="130" x2="80" y2="140" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="220" y1="130" x2="240" y2="140" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Tail */}
      <line x1="130" y1="68" x2="190" y2="68" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="140" y1="68" x2="130" y2="74" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="180" y1="68" x2="190" y2="74" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Nose */}
      <circle cx="160" cy="178" r="3" fill="#33ff66" opacity="0.6" />
      {/* Scan lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" y1={48 * i + 24} x2="320" y2={48 * i + 24} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function DroneSvg() {
  return (
    <svg viewBox="0 0 320 240" width="320" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#0d0d1a" />
      {/* Body */}
      <rect x="140" y="105" width="40" height="30" rx="4" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Arms */}
      <line x1="140" y1="110" x2="100" y2="85" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="180" y1="110" x2="220" y2="85" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="140" y1="130" x2="100" y2="155" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      <line x1="180" y1="130" x2="220" y2="155" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Rotors */}
      <circle cx="100" cy="85" r="18" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="220" cy="85" r="18" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="100" cy="155" r="18" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      <circle cx="220" cy="155" r="18" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
      {/* Scan lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" y1={48 * i + 24} x2="320" y2={48 * i + 24} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function HelicopterSvg() {
  return (
    <svg viewBox="0 0 320 240" width="320" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#0d0d1a" />
      {/* Main body */}
      <ellipse cx="150" cy="130" rx="35" ry="20" fill="none" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Cockpit */}
      <ellipse cx="185" cy="135" rx="15" ry="12" fill="none" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      {/* Tail boom */}
      <line x1="115" y1="125" x2="65" y2="105" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Tail rotor */}
      <line x1="60" y1="90" x2="70" y2="120" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Main rotor */}
      <line x1="80" y1="105" x2="240" y2="105" stroke="#33ff66" strokeWidth="1.5" opacity="0.7" />
      <circle cx="160" cy="105" r="3" fill="#33ff66" opacity="0.6" />
      {/* Rotor disc */}
      <ellipse cx="160" cy="105" rx="82" ry="6" fill="none" stroke="#33ff66" strokeWidth="0.5" opacity="0.25" strokeDasharray="6 4" />
      {/* Skids */}
      <line x1="130" y1="150" x2="130" y2="160" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      <line x1="170" y1="150" x2="170" y2="160" stroke="#33ff66" strokeWidth="1" opacity="0.6" />
      <line x1="120" y1="160" x2="180" y2="160" stroke="#33ff66" strokeWidth="1.5" opacity="0.8" />
      {/* Scan lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" y1={48 * i + 24} x2="320" y2={48 * i + 24} stroke="#33ff66" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function MissileSvg() {
  return (
    <svg viewBox="0 0 320 240" width="320" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#0d0d1a" />
      {/* Body */}
      <rect x="130" y="70" width="20" height="90" rx="8" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      {/* Nose cone */}
      <polygon points="140,50 130,70 150,70" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      {/* Fins */}
      <polygon points="130,150 110,175 130,160" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      <polygon points="150,150 170,175 150,160" fill="none" stroke="#ff4444" strokeWidth="1.5" opacity="0.8" />
      {/* Exhaust */}
      <line x1="135" y1="165" x2="130" y2="190" stroke="#ff8800" strokeWidth="1" opacity="0.5" />
      <line x1="140" y1="165" x2="140" y2="195" stroke="#ff8800" strokeWidth="1" opacity="0.6" />
      <line x1="145" y1="165" x2="150" y2="190" stroke="#ff8800" strokeWidth="1" opacity="0.5" />
      {/* Scan lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" y1={48 * i + 24} x2="320" y2={48 * i + 24} stroke="#ff4444" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

function UnknownSvg() {
  return (
    <svg viewBox="0 0 320 240" width="320" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#0d0d1a" />
      {/* Blob / uncertain contact */}
      <circle cx="160" cy="120" r="24" fill="none" stroke="#ffcc00" strokeWidth="1.5" opacity="0.6" strokeDasharray="6 3" />
      <circle cx="160" cy="120" r="8" fill="#ffcc00" opacity="0.3" />
      <circle cx="160" cy="120" r="3" fill="#ffcc00" opacity="0.7" />
      {/* Question mark */}
      <text x="160" y="80" textAnchor="middle" fill="#ffcc00" opacity="0.4" fontSize="20" fontFamily="monospace">?</text>
      {/* Noise dots */}
      {[
        [120, 90], [200, 100], [140, 160], [190, 150], [110, 140],
        [210, 130], [130, 100], [180, 170], [150, 80], [170, 90],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#ffcc00" opacity={0.15 + (i % 3) * 0.1} />
      ))}
      {/* Scan lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" y1={48 * i + 24} x2="320" y2={48 * i + 24} stroke="#ffcc00" strokeWidth="0.3" opacity="0.15" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Classification to SVG mapping
// ---------------------------------------------------------------------------

const CLASSIFICATION_SVG: Record<string, () => React.JSX.Element> = {
  aircraft: AircraftSvg,
  fighter_aircraft: AircraftSvg,
  civilian_aircraft: AircraftSvg,
  passenger_aircraft: AircraftSvg,
  light_aircraft: AircraftSvg,
  drone: DroneSvg,
  uav: DroneSvg,
  small_uav: DroneSvg,
  helicopter: HelicopterSvg,
  missile: MissileSvg,
  unknown: UnknownSvg,
};

function getSvgForClassification(classification: string): () => React.JSX.Element {
  return CLASSIFICATION_SVG[classification] ?? UnknownSvg;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    width: '320px',
    background: '#0a0a1a',
    border: '1px solid #2a2a3e',
    borderRadius: '6px',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    color: '#e0e0e0',
    fontSize: '12px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: '#111128',
    borderBottom: '1px solid #2a2a3e',
  } as React.CSSProperties,
  headerTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    color: '#888',
    border: '1px solid #333',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '1',
    padding: '2px 6px',
    fontWeight: 700,
  } as React.CSSProperties,
  imageContainer: {
    width: '320px',
    height: '240px',
    position: 'relative' as const,
    overflow: 'hidden',
    borderBottom: '1px solid #2a2a3e',
  } as React.CSSProperties,
  overlay: {
    position: 'absolute' as const,
    bottom: '6px',
    left: '6px',
    background: 'rgba(0,0,0,0.7)',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    color: '#33ff66',
    fontFamily: '"Fira Code", "Consolas", monospace',
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  overlayRight: {
    position: 'absolute' as const,
    bottom: '6px',
    right: '6px',
    background: 'rgba(0,0,0,0.7)',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    color: '#aaa',
    fontFamily: '"Fira Code", "Consolas", monospace',
  } as React.CSSProperties,
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0',
    padding: '0',
  } as React.CSSProperties,
  metaCell: {
    padding: '5px 10px',
    borderBottom: '1px solid #1a1a2e',
    borderRight: '1px solid #1a1a2e',
  } as React.CSSProperties,
  metaLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '1px',
  } as React.CSSProperties,
  metaValue: {
    fontSize: '12px',
    fontFamily: '"Fira Code", "Consolas", monospace',
    color: '#e0e0e0',
  } as React.CSSProperties,
  classificationBadge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
};

// ---------------------------------------------------------------------------
// Classification colors
// ---------------------------------------------------------------------------

function getClassColor(classification: string): string {
  if (classification === 'missile') return '#ff4444';
  if (classification === 'unknown') return '#ffcc00';
  return '#33ff66';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EoImageWindowProps {
  targetId: string;
  classification: string;
  bearingDeg: number;
  rangM: number;
  snr?: number;
  timestamp?: number;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EoImageWindow({
  targetId,
  classification,
  bearingDeg,
  rangM,
  snr,
  timestamp,
  onClose,
}: EoImageWindowProps) {
  const SvgComponent = getSvgForClassification(classification);
  const classColor = getClassColor(classification);
  const displayClassification = classification.replace(/_/g, ' ');

  const rangeKm = (rangM / 1000).toFixed(1);
  const bearingStr = bearingDeg.toFixed(1);
  const snrStr = snr !== undefined ? snr.toFixed(1) : '--';
  const timeStr = timestamp
    ? new Date(timestamp).toISOString().slice(11, 19)
    : '--:--:--';

  return (
    <div style={styles.container}>
      {/* Header bar */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={{ color: '#ff8800', fontSize: '10px' }}>EO</span>
          <span>Sensor Feed — {targetId.slice(0, 8)}</span>
        </div>
        <button
          style={styles.closeBtn}
          onClick={onClose}
          title="Close EO image window"
        >
          x
        </button>
      </div>

      {/* Image area — 320x240 SVG placeholder */}
      <div style={styles.imageContainer}>
        <SvgComponent />
        {/* Classification overlay */}
        <div style={styles.overlay}>
          {displayClassification.toUpperCase()}
        </div>
        {/* Timestamp overlay */}
        <div style={styles.overlayRight}>
          {timeStr}
        </div>
      </div>

      {/* Metadata grid */}
      <div style={styles.metaGrid}>
        <div style={styles.metaCell}>
          <div style={styles.metaLabel}>Classification</div>
          <div>
            <span style={styles.classificationBadge(classColor)}>
              {displayClassification}
            </span>
          </div>
        </div>
        <div style={{ ...styles.metaCell, borderRight: 'none' }}>
          <div style={styles.metaLabel}>Bearing</div>
          <div style={styles.metaValue}>{bearingStr}&deg;</div>
        </div>
        <div style={styles.metaCell}>
          <div style={styles.metaLabel}>Range</div>
          <div style={styles.metaValue}>{rangeKm} km</div>
        </div>
        <div style={{ ...styles.metaCell, borderRight: 'none' }}>
          <div style={styles.metaLabel}>SNR</div>
          <div style={styles.metaValue}>{snrStr} dB</div>
        </div>
      </div>
    </div>
  );
}
