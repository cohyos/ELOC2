import React, { useState } from 'react';

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  isInstructor: boolean;
  simElapsed: number; // current simulation elapsed seconds
}

const formatTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function ReportModal({ open, onClose, isInstructor, simElapsed }: ReportModalProps) {
  const [selectedType, setSelectedType] = useState<'operator' | 'instructor'>('operator');
  const [fromTime, setFromTime] = useState(0);
  const [toTime, setToTime] = useState(simElapsed);
  const [generating, setGenerating] = useState(false);

  // Sync toTime when simElapsed changes and modal opens
  React.useEffect(() => {
    if (open) {
      setToTime(simElapsed);
    }
  }, [open, simElapsed]);

  if (!open) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, timeRange: { from: fromTime, to: toTime } }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const blob = await res.blob();
      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition');
      let filename = `ELOC2_Report_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')}.pdf`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error('Report generation failed:', err);
    }
    setGenerating(false);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: '#141425',
        border: '1px solid #2a2a3e',
        borderRadius: '8px',
        padding: '24px',
        minWidth: '360px',
        maxWidth: '440px',
        position: 'relative',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '2px 6px',
            lineHeight: 1,
          }}
          title="Close"
        >
          &times;
        </button>

        {/* Title */}
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: '#fff' }}>
          Generate Report
        </h2>

        {/* Report Type */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Report Type
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px', fontSize: '13px' }}>
            <input
              type="radio"
              name="reportType"
              value="operator"
              checked={selectedType === 'operator'}
              onChange={() => setSelectedType('operator')}
              style={{ accentColor: '#4a9eff' }}
            />
            Operator Report
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isInstructor ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              opacity: isInstructor ? 1 : 0.4,
            }}
            title={!isInstructor ? 'Instructor role required' : undefined}
          >
            <input
              type="radio"
              name="reportType"
              value="instructor"
              checked={selectedType === 'instructor'}
              onChange={() => isInstructor && setSelectedType('instructor')}
              disabled={!isInstructor}
              style={{ accentColor: '#4a9eff' }}
            />
            Instructor Report
          </label>
        </div>

        {/* Time Range */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Time Range
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>From (sec)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={0}
                  max={toTime}
                  value={fromTime}
                  onChange={e => setFromTime(Math.max(0, Number(e.target.value)))}
                  style={{
                    background: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '4px',
                    color: '#e0e0e0',
                    padding: '6px 8px',
                    fontSize: '13px',
                    width: '80px',
                    fontFamily: 'monospace',
                  }}
                />
                <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>{formatTime(fromTime)}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>To (sec)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={fromTime}
                  value={toTime}
                  onChange={e => setToTime(Math.max(fromTime, Number(e.target.value)))}
                  style={{
                    background: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '4px',
                    color: '#e0e0e0',
                    padding: '6px 8px',
                    fontSize: '13px',
                    width: '80px',
                    fontFamily: 'monospace',
                  }}
                />
                <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>{formatTime(toTime)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generating ? undefined : handleGenerate}
          disabled={generating}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '4px',
            border: 'none',
            background: generating ? '#333' : '#4a9eff',
            color: generating ? '#888' : '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {generating ? (
            <>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid #555',
                borderTopColor: '#aaa',
                borderRadius: '50%',
                animation: 'report-spin 0.8s linear infinite',
              }} />
              Generating...
            </>
          ) : (
            'Generate'
          )}
        </button>

        {/* Spinner keyframes */}
        <style>{`
          @keyframes report-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
