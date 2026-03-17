import React, { useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorSensor, EditorTarget, EditorFault, EditorAction } from '../stores/editor-store';

const colors = {
  headerBg: '#1a1a2e',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
};

const btnStyle: React.CSSProperties = {
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: '4px 12px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

interface EditorHeaderProps {
  onBack: () => void;
}

export function EditorHeader({ onBack }: EditorHeaderProps) {
  const scenarioName = useEditorStore((s) => s.scenarioName);
  const setScenarioName = useEditorStore((s) => s.setScenarioName);
  const validationResult = useEditorStore((s) => s.validationResult);
  const setValidationResult = useEditorStore((s) => s.setValidationResult);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildExportPayload = useCallback(() => {
    const state = useEditorStore.getState();
    return {
      id: 'custom-' + Date.now(),
      name: state.scenarioName,
      description: state.description,
      durationSec: state.duration,
      policyMode: state.policyMode,
      sensors: state.sensors.map((s) => ({
        sensorId: s.id,
        type: s.type,
        position: { lat: s.lat, lon: s.lon, alt: s.alt },
        coverage: {
          minAzDeg: s.azMin,
          maxAzDeg: s.azMax,
          minElDeg: s.elMin,
          maxElDeg: s.elMax,
          maxRangeM: s.rangeMaxKm * 1000,
        },
        ...(s.type === 'eo'
          ? {
              fov: {
                halfAngleHDeg: s.fovHalfAngleH ?? 2.5,
                halfAngleVDeg: s.fovHalfAngleV ?? 1.8,
              },
              slewRateDegPerSec: s.slewRateDegSec ?? 30,
            }
          : {}),
      })),
      targets: state.targets.map((t) => ({
        targetId: t.id,
        name: t.label,
        description: '',
        startTime: t.waypoints.length > 0 ? t.waypoints[0].arrivalTimeSec : 0,
        waypoints: t.waypoints.map((wp) => ({
          time: wp.arrivalTimeSec,
          position: { lat: wp.lat, lon: wp.lon, alt: wp.alt },
        })),
      })),
      faults: state.faults.map((f) => ({
        type: f.type,
        sensorId: f.sensorId,
        startTime: f.startTimeSec,
        endTime: f.endTimeSec,
        magnitude: f.magnitude,
      })),
      operatorActions: state.actions.map((a) => ({
        type: a.type,
        time: a.timeSec,
        sensorId: a.sensorId,
        targetId: a.targetId,
      })),
    };
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      const res = await fetch('/api/scenarios/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Scenario saved successfully.');
      } else {
        alert('Save failed: ' + (await res.text()));
      }
    } catch (err) {
      alert('Save error: ' + (err as Error).message);
    }
  }, [buildExportPayload]);

  const handleExport = useCallback(() => {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildExportPayload]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          const store = useEditorStore.getState();
          store.reset();
          if (data.name) store.setScenarioName(data.name);
          if (data.description) store.setDescription(data.description);
          if (data.durationSec) store.setDuration(data.durationSec);
          if (data.policyMode) store.setPolicyMode(data.policyMode);

          // Import sensors
          if (Array.isArray(data.sensors)) {
            for (const s of data.sensors) {
              store.addSensor({
                id: s.sensorId || crypto.randomUUID(),
                type: s.type || 'radar',
                lat: s.position?.lat ?? 0,
                lon: s.position?.lon ?? 0,
                alt: s.position?.alt ?? 0,
                azMin: s.coverage?.minAzDeg ?? 0,
                azMax: s.coverage?.maxAzDeg ?? 360,
                elMin: s.coverage?.minElDeg ?? -5,
                elMax: s.coverage?.maxElDeg ?? 85,
                rangeMaxKm: (s.coverage?.maxRangeM ?? 100000) / 1000,
                fovHalfAngleH: s.fov?.halfAngleHDeg,
                fovHalfAngleV: s.fov?.halfAngleVDeg,
                slewRateDegSec: s.slewRateDegPerSec,
              });
            }
          }

          // Import targets
          if (Array.isArray(data.targets)) {
            for (const t of data.targets) {
              store.addTarget({
                id: t.targetId || crypto.randomUUID(),
                label: t.name || 'Target',
                rcs: 1,
                waypoints: (t.waypoints || []).map((wp: any) => ({
                  lat: wp.position?.lat ?? 0,
                  lon: wp.position?.lon ?? 0,
                  alt: wp.position?.alt ?? 0,
                  speedMs: 0,
                  arrivalTimeSec: wp.time ?? 0,
                })),
              });
            }
          }

          // Import faults
          if (Array.isArray(data.faults)) {
            for (const f of data.faults) {
              store.addFault({
                id: crypto.randomUUID(),
                type: f.type,
                sensorId: f.sensorId,
                startTimeSec: f.startTime ?? 0,
                endTimeSec: f.endTime ?? 0,
                magnitude: f.magnitude,
              });
            }
          }
        } catch (err) {
          alert('Import failed: ' + (err as Error).message);
        }
      };
      reader.readAsText(file);
      // Reset file input so same file can be re-imported
      e.target.value = '';
    },
    []
  );

  const handleValidate = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      const res = await fetch('/api/scenarios/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        setValidationResult(result);
      } else {
        setValidationResult({
          errors: ['Validation request failed: ' + (await res.text())],
          warnings: [],
        });
      }
    } catch (err) {
      setValidationResult({
        errors: ['Validation error: ' + (err as Error).message],
        warnings: [],
      });
    }
  }, [buildExportPayload, setValidationResult]);

  const handleStart = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      await fetch('/api/scenario/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: payload.id, custom: payload }),
      });
      onBack();
    } catch (err) {
      alert('Start failed: ' + (err as Error).message);
    }
  }, [buildExportPayload, onBack]);

  return (
    <header
      style={{
        background: colors.headerBg,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '8px',
        fontSize: '13px',
        borderBottom: `1px solid ${colors.border}`,
        height: '40px',
        flexShrink: 0,
      }}
    >
      <button
        style={{ ...btnStyle, background: '#444', color: '#ddd' }}
        onClick={onBack}
      >
        ← Back
      </button>

      <input
        type="text"
        value={scenarioName}
        onChange={(e) => setScenarioName(e.target.value)}
        style={{
          background: '#222',
          color: '#fff',
          border: '1px solid #444',
          borderRadius: '3px',
          padding: '3px 8px',
          fontSize: '13px',
          fontWeight: 700,
          width: '200px',
        }}
        title="Scenario name"
      />

      <button style={btnStyle} onClick={handleSave}>
        Save
      </button>
      <button style={btnStyle} onClick={handleExport}>
        Export JSON
      </button>
      <button style={btnStyle} onClick={handleImport}>
        Import JSON
      </button>
      <button style={btnStyle} onClick={handleValidate}>
        Validate
      </button>
      <button
        style={{
          ...btnStyle,
          background: '#00aa44',
          color: '#fff',
        }}
        onClick={handleStart}
      >
        Start
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Validation result summary */}
      {validationResult && (
        <div
          style={{
            marginLeft: '8px',
            fontSize: '11px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          {validationResult.errors.length > 0 && (
            <span style={{ color: '#ff3333' }}>
              {validationResult.errors.length} error
              {validationResult.errors.length !== 1 ? 's' : ''}
            </span>
          )}
          {validationResult.warnings.length > 0 && (
            <span style={{ color: '#ffcc00' }}>
              {validationResult.warnings.length} warning
              {validationResult.warnings.length !== 1 ? 's' : ''}
            </span>
          )}
          {validationResult.errors.length === 0 &&
            validationResult.warnings.length === 0 && (
              <span style={{ color: '#00cc44' }}>Valid</span>
            )}
        </div>
      )}

      <span
        style={{
          marginLeft: 'auto',
          fontSize: '11px',
          color: colors.textDim,
        }}
      >
        Scenario Editor
      </span>
    </header>
  );
}
