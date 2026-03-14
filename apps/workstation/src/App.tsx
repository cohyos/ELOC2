import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [34.8, 31.5],
      zoom: 8,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        background: '#1a1a2e', color: '#fff', padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px',
        flexShrink: 0
      }}>
        <strong style={{ fontSize: '16px' }}>ELOC2</strong>
        <span style={{ opacity: 0.7 }}>EO C2 Air Defense Demonstrator</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '12px' }}>v0.1.0</span>
      </header>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map pane */}
        <div ref={mapContainer} style={{ flex: '1 1 60%', minWidth: 0 }} />

        {/* Detail pane - hidden on mobile */}
        <div style={{
          width: '400px', background: '#f5f5f5', borderLeft: '1px solid #ddd',
          padding: '16px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}
          className="detail-pane"
        >
          <h3 style={{ margin: 0, fontSize: '14px', color: '#555' }}>Track Details</h3>
          <p style={{ fontSize: '13px', color: '#888' }}>Select a track on the map to view details.</p>

          <h3 style={{ margin: '16px 0 0', fontSize: '14px', color: '#555' }}>Sensor Health</h3>
          <p style={{ fontSize: '13px', color: '#888' }}>No sensors deployed.</p>
        </div>
      </div>

      {/* Timeline pane */}
      <div style={{
        height: '120px', background: '#1a1a2e', borderTop: '1px solid #333',
        padding: '8px 16px', color: '#ccc', fontSize: '12px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <strong>Timeline</strong>
          <span style={{ opacity: 0.5 }}>|</span>
          <button style={{ background: '#333', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Play</button>
          <button style={{ background: '#333', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Pause</button>
          <span style={{ marginLeft: 'auto', opacity: 0.5 }}>T+0:00</span>
        </div>
        <div style={{ background: '#333', height: '4px', borderRadius: '2px', marginTop: '8px' }}>
          <div style={{ background: '#4a9eff', height: '100%', width: '0%', borderRadius: '2px' }} />
        </div>
        <p style={{ marginTop: '8px', opacity: 0.5 }}>No scenario loaded. Events will appear here.</p>
      </div>
    </div>
  );
}
