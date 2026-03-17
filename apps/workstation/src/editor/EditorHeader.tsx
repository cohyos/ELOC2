import React, { useRef, useState, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const buildScenarioDefinition = useEditorStore((s) => s.buildScenarioDefinition);
  const loadFromScenarioDefinition = useEditorStore((s) => s.loadFromScenarioDefinition);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const payload = buildScenarioDefinition();
      const res = await fetch('/api/scenarios/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Scenario saved successfully.', 'success');
      } else {
        showToast('Save failed: ' + (await res.text()), 'error');
      }
    } catch (err) {
      showToast('Save error: ' + (err as Error).message, 'error');
    }
  }, [buildScenarioDefinition, showToast]);

  const handleExport = useCallback(() => {
    const payload = buildScenarioDefinition();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-${payload.name.replace(/\s+/g, '_').toLowerCase()}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildScenarioDefinition]);

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
          if (!data || typeof data !== 'object') {
            showToast('Invalid JSON file.', 'error');
            return;
          }
          loadFromScenarioDefinition(data);
          showToast('Scenario imported successfully.', 'success');
        } catch (err) {
          showToast('Import failed: ' + (err as Error).message, 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [loadFromScenarioDefinition, showToast]
  );

  const handleValidate = useCallback(async () => {
    try {
      const payload = buildScenarioDefinition();
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
  }, [buildScenarioDefinition, setValidationResult]);

  const handleStart = useCallback(async () => {
    try {
      // Check validation first
      if (validationResult && validationResult.errors.length > 0) {
        alert('Cannot start: scenario has validation errors. Fix them first.');
        return;
      }

      const payload = buildScenarioDefinition();

      // Save first
      await fetch('/api/scenarios/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Reset with custom scenario
      await fetch('/api/scenario/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: payload.id, custom: payload }),
      });

      // Start the scenario
      await fetch('/api/scenario/start', { method: 'POST' });

      onBack();
    } catch (err) {
      showToast('Start failed: ' + (err as Error).message, 'error');
    }
  }, [buildScenarioDefinition, validationResult, onBack, showToast]);

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

      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '50px',
            right: '16px',
            background: toast.type === 'success' ? '#00aa44' : '#cc2222',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {toast.message}
        </div>
      )}
    </header>
  );
}
