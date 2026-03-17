import React, { useEffect, useState, useRef } from 'react';
import { useTrackStore } from '../stores/track-store';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';
import type { GeometryEstimate } from '@eloc2/domain';
import { EvidenceChain } from './EvidenceChain';
import type { TrackEvidence } from './EvidenceChain';
import { InvestigationHistory } from './InvestigationHistory';
import type { InvestigationHistoryData } from './InvestigationHistory';
import { ThreatAssessment } from './ThreatAssessment';
import type { ThreatAssessmentData } from './ThreatAssessment';

const styles = {
  container: {
    padding: '12px',
    color: '#e0e0e0',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: '1px solid #555',
    color: '#aaa',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
  } as React.CSSProperties,
  section: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '12px',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '12px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  lineageItem: {
    padding: '4px 0',
    borderLeft: '2px solid #444',
    paddingLeft: '8px',
    marginBottom: '4px',
    fontSize: '11px',
  } as React.CSSProperties,
};

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'tentative': return '#ffcc00';
    case 'dropped': return '#ff3333';
    default: return '#888888';
  }
}

function eoStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'in_progress': return '#4488ff';
    case 'pending': return '#ffcc00';
    case 'no_support': return '#ff8800';
    case 'split_detected': return '#ff3333';
    default: return '#888888';
  }
}

function fusionModeColor(mode: string): string {
  switch (mode) {
    case 'centralized_measurement_fusion': return '#00cc44';
    case 'conservative_track_fusion': return '#ffcc00';
    case 'confirmation_only': return '#ff8800';
    default: return '#888888';
  }
}

function fusionModeLabel(mode: string): string {
  switch (mode) {
    case 'centralized_measurement_fusion': return 'Centralized';
    case 'conservative_track_fusion': return 'Conservative';
    case 'confirmation_only': return 'Confirmation Only';
    default: return mode;
  }
}

export function TrackDetailPanel() {
  const selectedTrackId = useUiStore(s => s.selectedTrackId);
  const selectTrack = useUiStore(s => s.selectTrack);
  const tracksById = useTrackStore(s => s.tracksById);
  const geometryEstimates = useTaskStore(s => s.geometryEstimates);
  const eoTracks = useTaskStore(s => s.eoTracks);
  const fusionModes = useTaskStore(s => s.fusionModes);
  const [geometry, setGeometry] = useState<GeometryEstimate | null>(null);
  const [dossier, setDossier] = useState<{
    evidence: TrackEvidence;
    investigationHistory: InvestigationHistoryData;
    threatAssessment: ThreatAssessmentData;
  } | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const dossierFetchRef = useRef<string | null>(null);

  const track = selectedTrackId ? tracksById.get(selectedTrackId) : null;

  // Use WS geometry data if available, fall back to REST
  const wsGeometry = selectedTrackId
    ? geometryEstimates.find(g => g.trackId === selectedTrackId)
    : null;

  // Get EO tracks associated with this system track
  const trackEoTracks = selectedTrackId
    ? eoTracks.filter(t => t.associatedSystemTrackId === selectedTrackId)
    : [];

  // Get dominant fusion mode for this track's sensors
  const trackFusionModes = track
    ? track.sources.map(s => fusionModes[s as string]).filter(Boolean)
    : [];

  useEffect(() => {
    if (!selectedTrackId || wsGeometry) {
      setGeometry(null);
      return;
    }
    fetch(`/api/geometry/${selectedTrackId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGeometry(data))
      .catch(() => setGeometry(null));
  }, [selectedTrackId, wsGeometry]);

  // Fetch enriched dossier data when selected track changes
  useEffect(() => {
    if (!selectedTrackId) {
      setDossier(null);
      dossierFetchRef.current = null;
      return;
    }
    const fetchId = selectedTrackId;
    dossierFetchRef.current = fetchId;
    setDossierLoading(true);
    fetch(`/api/tracks/${selectedTrackId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (dossierFetchRef.current !== fetchId) return;
        if (data?.evidence && data?.investigationHistory && data?.threatAssessment) {
          setDossier({
            evidence: data.evidence,
            investigationHistory: data.investigationHistory,
            threatAssessment: data.threatAssessment,
          });
        } else {
          setDossier(null);
        }
        setDossierLoading(false);
      })
      .catch(() => {
        if (dossierFetchRef.current !== fetchId) return;
        setDossier(null);
        setDossierLoading(false);
      });

    // Re-fetch periodically while track is selected (every 5s)
    const interval = setInterval(() => {
      if (dossierFetchRef.current !== fetchId) return;
      fetch(`/api/tracks/${fetchId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (dossierFetchRef.current !== fetchId) return;
          if (data?.evidence && data?.investigationHistory && data?.threatAssessment) {
            setDossier({
              evidence: data.evidence,
              investigationHistory: data.investigationHistory,
              threatAssessment: data.threatAssessment,
            });
          }
        })
        .catch(() => { /* ignore */ });
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedTrackId]);

  if (!track) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select a track on the map to view details.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{track.systemTrackId}</h3>
        <button style={styles.closeBtn} onClick={() => selectTrack(null)}>Close</button>
      </div>

      {/* Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Status</div>
        <div style={styles.row}>
          <span style={styles.label}>Track Status</span>
          <span style={styles.badge(statusColor(track.status))}>{track.status}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Confidence</span>
          <span style={styles.value}>{(track.confidence * 100).toFixed(1)}%</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>EO Investigation</span>
          <span style={styles.badge(eoStatusColor(track.eoInvestigationStatus))}>
            {track.eoInvestigationStatus}
          </span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Last Updated</span>
          <span style={styles.value}>{new Date(track.lastUpdated).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Position */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Position</div>
        <div style={styles.row}>
          <span style={styles.label}>Lat</span>
          <span style={styles.value}>{track.state.lat.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Lon</span>
          <span style={styles.value}>{track.state.lon.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Alt</span>
          <span style={styles.value}>{track.state.alt.toLocaleString()} m</span>
        </div>
      </div>

      {/* Velocity */}
      {track.velocity && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Velocity (ENU m/s)</div>
          <div style={styles.row}>
            <span style={styles.label}>Vx (East)</span>
            <span style={styles.value}>{track.velocity.vx.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Vy (North)</span>
            <span style={styles.value}>{track.velocity.vy.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Vz (Up)</span>
            <span style={styles.value}>{track.velocity.vz.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Speed</span>
            <span style={styles.value}>
              {Math.sqrt(
                track.velocity.vx ** 2 + track.velocity.vy ** 2 + track.velocity.vz ** 2
              ).toFixed(1)} m/s
            </span>
          </div>
        </div>
      )}

      {/* Fusion Mode */}
      {trackFusionModes.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Fusion Mode</div>
          {[...new Set(trackFusionModes)].map(mode => (
            <div key={mode} style={styles.row}>
              <span style={styles.badge(fusionModeColor(mode))}>
                {fusionModeLabel(mode)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sources */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Source Contributions</div>
        {track.sources.map(sid => {
          const mode = fusionModes[sid as string];
          return (
            <div key={sid} style={{ ...styles.row, alignItems: 'center' }}>
              <span style={styles.value}>{sid}</span>
              {mode && (
                <span style={{ ...styles.label, fontSize: '10px' }}>
                  {fusionModeLabel(mode)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Geometry */}
      {(wsGeometry || geometry) && (() => {
        const geo = wsGeometry ?? geometry!;
        const q = ('quality' in geo) ? geo.quality : '';
        const qColor = q === 'strong' ? '#00cc44' :
          q === 'acceptable' ? '#ffcc00' :
          q === 'weak' ? '#ff8800' : '#ff3333';
        return (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Geometry Estimate</div>
            <div style={styles.row}>
              <span style={styles.label}>Quality</span>
              <span style={styles.badge(qColor)}>{q}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Classification</span>
              <span style={styles.value}>{geo.classification}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Intersection Angle</span>
              <span style={styles.value}>{geo.intersectionAngleDeg.toFixed(1)} deg</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Time Alignment</span>
              <span style={styles.value}>{geo.timeAlignmentQualityMs} ms</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Bearing Noise</span>
              <span style={styles.value}>{geo.bearingNoiseDeg.toFixed(3)} deg</span>
            </div>
            {wsGeometry?.position3D && (
              <div style={styles.row}>
                <span style={styles.label}>3D Position</span>
                <span style={styles.value}>
                  {wsGeometry.position3D.lat.toFixed(4)}, {wsGeometry.position3D.lon.toFixed(4)}, {wsGeometry.position3D.alt.toFixed(0)}m
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* EO Identification Support */}
      {trackEoTracks.some(t => t.identificationSupport) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Identification Support</div>
          {trackEoTracks.filter(t => t.identificationSupport).map(t => (
            <div key={t.eoTrackId} style={{ ...styles.lineageItem, borderLeftColor: '#ff8800' }}>
              <div style={{ color: '#aaa', fontSize: '10px' }}>
                {t.sensorId} &middot; {t.status}
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Type</span>
                <span style={styles.value}>{t.identificationSupport!.type}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Confidence</span>
                <span style={styles.value}>{(t.identificationSupport!.confidence * 100).toFixed(0)}%</span>
              </div>
              {t.identificationSupport!.features.length > 0 && (
                <div style={{ color: '#aaa', fontSize: '10px', marginTop: '2px' }}>
                  Features: {t.identificationSupport!.features.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lineage */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Lineage</div>
        {track.lineage.map((entry, i) => (
          <div key={i} style={styles.lineageItem}>
            <div style={{ color: '#aaa', fontSize: '10px' }}>
              v{entry.version} &middot; {new Date(entry.timestamp).toLocaleTimeString()}
            </div>
            <div style={{ color: '#ccc' }}>{entry.description}</div>
          </div>
        ))}
      </div>

      {/* Dossier Sections */}
      {dossierLoading && !dossier && (
        <div style={{ color: '#555', fontSize: '11px', fontStyle: 'italic', padding: '8px 0' }}>
          Loading dossier...
        </div>
      )}
      {dossier && (
        <>
          <EvidenceChain evidence={dossier.evidence} />
          <InvestigationHistory investigationHistory={dossier.investigationHistory} />
          <ThreatAssessment threatAssessment={dossier.threatAssessment} />
        </>
      )}
    </div>
  );
}
