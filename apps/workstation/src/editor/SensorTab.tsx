import React, { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorSensor } from '../stores/editor-store';
import {
  SENSOR_TEMPLATES,
  SENSOR_TEMPLATE_LABELS,
  type SensorTemplateName,
} from './sensor-templates';

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

const styles = {
  container: {
    padding: '12px',
    color: '#e0e0e0',
    fontSize: '13px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
  },
  sensorItem: (selected: boolean, color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    background: selected ? '#2a2a4e' : '#1a1a2e',
    border: `1px solid ${selected ? color : '#2a2a3e'}`,
    borderRadius: '4px',
    marginBottom: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  dot: (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  addBtn: {
    background: '#333',
    color: '#aaa',
    border: '1px dashed #555',
    padding: '6px 12px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    width: '100%',
    marginBottom: '12px',
  } as React.CSSProperties,
  formRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    fontSize: '12px',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '11px',
    minWidth: '70px',
  } as React.CSSProperties,
  input: {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px',
    width: '120px',
    fontFamily: '"Fira Code", "Consolas", monospace',
  } as React.CSSProperties,
  select: {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px',
    width: '130px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteBtn: {
    background: '#ff333322',
    color: '#ff3333',
    border: '1px solid #ff333344',
    padding: '4px 12px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    width: '100%',
    marginTop: '12px',
  } as React.CSSProperties,
};

function NumberInput({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      step={step ?? 1}
      min={min}
      max={max}
      style={styles.input}
    />
  );
}

function SensorForm({ sensor }: { sensor: EditorSensor }) {
  const updateSensor = useEditorStore((s) => s.updateSensor);
  const removeSensor = useEditorStore((s) => s.removeSensor);

  const update = useCallback(
    (updates: Partial<EditorSensor>) => {
      updateSensor(sensor.id, updates);
    },
    [sensor.id, updateSensor]
  );

  const handleTemplateChange = useCallback(
    (templateName: string) => {
      if (templateName in SENSOR_TEMPLATES) {
        const tmpl =
          SENSOR_TEMPLATES[templateName as SensorTemplateName];
        update({
          template: templateName,
          type: tmpl.type,
          azMin: tmpl.azMin,
          azMax: tmpl.azMax,
          elMin: tmpl.elMin,
          elMax: tmpl.elMax,
          rangeMaxKm: tmpl.rangeMaxKm,
          fovHalfAngleH:
            'fovHalfAngleH' in tmpl ? tmpl.fovHalfAngleH : undefined,
          fovHalfAngleV:
            'fovHalfAngleV' in tmpl ? tmpl.fovHalfAngleV : undefined,
          slewRateDegSec:
            'slewRateDegSec' in tmpl ? tmpl.slewRateDegSec : undefined,
        });
      }
    },
    [update]
  );

  const handleDelete = useCallback(() => {
    if (confirm('Delete this sensor?')) {
      removeSensor(sensor.id);
    }
  }, [sensor.id, removeSensor]);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.sectionTitle}>Sensor Configuration</div>

      {/* Template */}
      <div style={styles.formRow}>
        <span style={styles.label}>Template</span>
        <select
          value={sensor.template || ''}
          onChange={(e) => handleTemplateChange(e.target.value)}
          style={styles.select}
        >
          <option value="">Custom</option>
          {Object.entries(SENSOR_TEMPLATE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* ID */}
      <div style={styles.formRow}>
        <span style={styles.label}>ID</span>
        <input
          type="text"
          value={sensor.id}
          readOnly
          style={{ ...styles.input, opacity: 0.6, cursor: 'default' }}
          title={sensor.id}
        />
      </div>

      {/* Type */}
      <div style={styles.formRow}>
        <span style={styles.label}>Type</span>
        <select
          value={sensor.type}
          onChange={(e) =>
            update({ type: e.target.value as EditorSensor['type'] })
          }
          style={styles.select}
        >
          <option value="radar">Radar</option>
          <option value="eo">EO</option>
          <option value="c4isr">C4ISR</option>
        </select>
      </div>

      {/* Position */}
      <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>Position</div>
      <div style={styles.formRow}>
        <span style={styles.label}>Lat</span>
        <NumberInput
          value={sensor.lat}
          onChange={(v) => update({ lat: v })}
          step={0.001}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Lon</span>
        <NumberInput
          value={sensor.lon}
          onChange={(v) => update({ lon: v })}
          step={0.001}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Alt (m)</span>
        <NumberInput
          value={sensor.alt}
          onChange={(v) => update({ alt: v })}
          step={10}
          min={0}
        />
      </div>

      {/* Coverage */}
      <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>Coverage</div>
      <div style={styles.formRow}>
        <span style={styles.label}>Az Min</span>
        <NumberInput
          value={sensor.azMin}
          onChange={(v) => update({ azMin: v })}
          min={0}
          max={360}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Az Max</span>
        <NumberInput
          value={sensor.azMax}
          onChange={(v) => update({ azMax: v })}
          min={0}
          max={360}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>El Min</span>
        <NumberInput
          value={sensor.elMin}
          onChange={(v) => update({ elMin: v })}
          min={-90}
          max={90}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>El Max</span>
        <NumberInput
          value={sensor.elMax}
          onChange={(v) => update({ elMax: v })}
          min={-90}
          max={90}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Range (km)</span>
        <NumberInput
          value={sensor.rangeMaxKm}
          onChange={(v) => update({ rangeMaxKm: v })}
          step={10}
          min={1}
        />
      </div>

      {/* EO-only fields */}
      {sensor.type === 'eo' && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>
            EO Parameters
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>FOV H (deg)</span>
            <NumberInput
              value={sensor.fovHalfAngleH ?? 2.5}
              onChange={(v) => update({ fovHalfAngleH: v })}
              step={0.1}
              min={0.1}
            />
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>FOV V (deg)</span>
            <NumberInput
              value={sensor.fovHalfAngleV ?? 1.8}
              onChange={(v) => update({ fovHalfAngleV: v })}
              step={0.1}
              min={0.1}
            />
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>Slew (deg/s)</span>
            <NumberInput
              value={sensor.slewRateDegSec ?? 30}
              onChange={(v) => update({ slewRateDegSec: v })}
              step={1}
              min={0}
            />
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>Init Az</span>
            <NumberInput
              value={sensor.initialGimbalAz ?? 0}
              onChange={(v) => update({ initialGimbalAz: v })}
              min={0}
              max={360}
            />
          </div>
        </>
      )}

      <button style={styles.deleteBtn} onClick={handleDelete}>
        Delete Sensor
      </button>
    </div>
  );
}

export function SensorTab() {
  const sensors = useEditorStore((s) => s.sensors);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const selectedItemType = useEditorStore((s) => s.selectedItemType);
  const selectItem = useEditorStore((s) => s.selectItem);
  const editMode = useEditorStore((s) => s.editMode);
  const setEditMode = useEditorStore((s) => s.setEditMode);

  const selectedSensor =
    selectedItemType === 'sensor'
      ? sensors.find((s) => s.id === selectedItemId) ?? null
      : null;

  const handleAddSensor = useCallback(() => {
    setEditMode('place-sensor');
  }, [setEditMode]);

  return (
    <div style={styles.container}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
          Sensors ({sensors.length})
        </span>
      </div>

      <button
        style={{
          ...styles.addBtn,
          background:
            editMode === 'place-sensor' ? '#ffcc0022' : '#333',
          color: editMode === 'place-sensor' ? '#ffcc00' : '#aaa',
          borderColor:
            editMode === 'place-sensor' ? '#ffcc0066' : '#555',
        }}
        onClick={handleAddSensor}
      >
        {editMode === 'place-sensor'
          ? 'Click map to place...'
          : '+ Add Sensor'}
      </button>

      {/* Sensor list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '8px',
          minHeight: 0,
        }}
      >
        {sensors.length === 0 ? (
          <p
            style={{
              color: '#555',
              fontSize: '11px',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No sensors defined. Click "Add Sensor" and place on map.
          </p>
        ) : (
          sensors.map((s) => {
            const color = SENSOR_COLORS[s.type] || '#888';
            const isSelected =
              selectedItemType === 'sensor' && selectedItemId === s.id;
            return (
              <div
                key={s.id}
                style={styles.sensorItem(isSelected, color)}
                onClick={() => selectItem('sensor', s.id)}
              >
                <div style={styles.dot(color)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '11px',
                      color: '#ddd',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.type.toUpperCase()}-{s.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {s.lat.toFixed(3)}, {s.lon.toFixed(3)} | {s.rangeMaxKm}km
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Configuration form for selected sensor */}
      {selectedSensor && <SensorForm sensor={selectedSensor} />}
    </div>
  );
}
