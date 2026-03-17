import React, { useState } from 'react';
import { useEditorStore } from '../stores/editor-store';

export function ValidationBar() {
  const validationResult = useEditorStore((s) => s.validationResult);
  const [expanded, setExpanded] = useState(false);

  if (!validationResult) return null;

  const errorCount = validationResult.errors.length;
  const warningCount = validationResult.warnings.length;
  const isValid = errorCount === 0 && warningCount === 0;

  // Auto-expand if there are errors
  const isExpanded = expanded || errorCount > 0;

  return (
    <div
      style={{
        background: '#141425',
        borderTop: `1px solid ${isValid ? '#00cc4444' : '#ff333344'}`,
        fontSize: '12px',
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {isValid ? (
          <span style={{ color: '#00cc44', fontWeight: 600 }}>
            &#10003; Valid
          </span>
        ) : (
          <span style={{ color: '#ff3333', fontWeight: 600 }}>
            &#10007;{' '}
            {errorCount > 0 &&
              `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
            {errorCount > 0 && warningCount > 0 && ', '}
            {warningCount > 0 &&
              `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            color: '#666',
            fontSize: '10px',
          }}
        >
          {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (errorCount > 0 || warningCount > 0) && (
        <div
          style={{
            padding: '0 16px 8px',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {validationResult.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '2px 0',
                fontSize: '11px',
                color: '#ff3333',
              }}
            >
              <span style={{ flexShrink: 0 }}>&#9679;</span>
              <span>{err}</span>
            </div>
          ))}
          {validationResult.warnings.map((warn, i) => (
            <div
              key={`warn-${i}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '2px 0',
                fontSize: '11px',
                color: '#ffcc00',
              }}
            >
              <span style={{ flexShrink: 0 }}>&#9679;</span>
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
