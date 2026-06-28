import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import { darkMenuProps } from "@theme/darkMenuProps";

import React, { useEffect, useState } from "react";

import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";

// Two-column grid shared by every parameter tab.
const fieldGridSx = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 } as const;

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  inputProps?: { min?: number; max?: number; step?: number };
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, inputProps }) => (
  <TextField
    fullWidth
    type="number"
    label={label}
    value={value.toString()}
    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    inputProps={inputProps}
  />
);

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

const SelectField: React.FC<SelectFieldProps> = ({ label, value, onChange, options }) => (
  <FormControl fullWidth>
    <InputLabel>{label}</InputLabel>
    <Select
      value={value}
      label={label}
      onChange={(e) => onChange(e.target.value as string)}
      MenuProps={darkMenuProps}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);

const OSCILLATOR_TYPES = ["sine", "square", "sawtooth", "triangle"];
const CURVE_TYPES = ["linear", "exponential"];

export interface InstrumentConfig {
  volume: number;
  detune: number;
  portamento: number;
  harmonicity: number;
  oscillator: {
    partialCount: number;
    partials: number[];
    phase: number;
    type: string;
    modulationType?: string;
  };
  envelope: {
    attack: number;
    attackCurve: string;
    decay: number;
    decayCurve: string;
    release: number;
    releaseCurve: string;
    sustain: number;
  };
}

const defaultConfig: InstrumentConfig = {
  volume: 1,
  detune: 0,
  portamento: 0,
  harmonicity: 3,
  oscillator: {
    partialCount: 0,
    partials: [],
    phase: 0,
    type: "sine",
    modulationType: "square",
  },
  envelope: {
    attack: 0.01,
    attackCurve: "linear",
    decay: 0.2,
    decayCurve: "exponential",
    release: 0.5,
    releaseCurve: "exponential",
    sustain: 1,
  },
};

interface InstrumentEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, config: InstrumentConfig) => void;
  editingInstrument?: { name: string; config: InstrumentConfig };
}

export const InstrumentEditor: React.FC<InstrumentEditorProps> = ({
  open,
  onClose,
  onSave,
  editingInstrument,
}) => {
  const [instrumentName, setInstrumentName] = useState<string>("");
  const [config, setConfig] = useState<InstrumentConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open) {
      if (editingInstrument) {
        setInstrumentName(editingInstrument.name);
        setConfig(editingInstrument.config);
      } else {
        setInstrumentName("");
        setConfig(defaultConfig);
      }
    }
  }, [editingInstrument, open]);

  const handleSave = (): void => {
    onSave(instrumentName.trim(), config);
    onClose();
  };

  const updateConfig = (path: string[], value: string | number | number[]): void => {
    setConfig((prev) => {
      const newConfig = { ...prev };
      let current: Record<string, unknown> = newConfig as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...(current[path[i]] as Record<string, unknown>) };
        current = current[path[i]] as Record<string, unknown>;
      }
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  const updateOscillator = (field: string, value: string | number | number[]): void => {
    updateConfig(["oscillator", field], value);
  };

  const updateEnvelope = (field: string, value: string | number | number[]): void => {
    updateConfig(["envelope", field], value);
  };

  const handlePartialsChange = (value: string): void => {
    try {
      const partials = value
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      updateOscillator("partials", partials);
      updateOscillator("partialCount", partials.length);
    } catch {
      // invalid input, ignore
    }
  };

  const handlePartialCountChange = (count: number): void => {
    updateOscillator("partialCount", count);
    if (count > config.oscillator.partials.length) {
      const newPartials = [
        ...config.oscillator.partials,
        ...Array(count - config.oscillator.partials.length).fill(0),
      ];
      updateOscillator("partials", newPartials);
    } else if (count < config.oscillator.partials.length) {
      updateOscillator("partials", config.oscillator.partials.slice(0, count));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={editingInstrument ? "Edit Instrument" : "Create New Instrument"}
      onConfirm={handleSave}
      confirmLabel="Save"
      confirmColor="primary"
      confirmDisabled={!instrumentName.trim()}
      maxWidth="md"
    >
      <Box sx={{ mt: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          label="Instrument Name"
          value={instrumentName}
          onChange={(e) => {
            setInstrumentName(e.target.value);
          }}
          required
          autoFocus
          sx={{ mb: 2 }}
        />

        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ mb: 2 }}
        >
          <Tab label="Basic" />
          <Tab label="Oscillator" />
          <Tab label="Envelope" />
        </Tabs>

        <Box sx={{ minHeight: 272 }}>
          {activeTab === 0 && (
            <Box sx={fieldGridSx}>
              <NumberField
                label="Volume"
                value={config.volume}
                onChange={(value) => updateConfig(["volume"], value)}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
              />
              <NumberField
                label="Detune (cents)"
                value={config.detune}
                onChange={(value) => updateConfig(["detune"], value)}
              />
              <NumberField
                label="Portamento"
                value={config.portamento}
                onChange={(value) => updateConfig(["portamento"], value)}
                inputProps={{ min: 0, step: 0.1 }}
              />
              <NumberField
                label="Harmonicity"
                value={config.harmonicity}
                onChange={(value) => updateConfig(["harmonicity"], value)}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={fieldGridSx}>
              <SelectField
                label="Type"
                value={config.oscillator.type}
                onChange={(value) => updateOscillator("type", value)}
                options={OSCILLATOR_TYPES}
              />
              <SelectField
                label="Modulation Type"
                value={config.oscillator.modulationType || "square"}
                onChange={(value) => updateOscillator("modulationType", value)}
                options={OSCILLATOR_TYPES}
              />
              <NumberField
                label="Phase"
                value={config.oscillator.phase}
                onChange={(value) => updateOscillator("phase", value)}
              />
              <NumberField
                label="Partial Count"
                value={config.oscillator.partialCount}
                onChange={handlePartialCountChange}
                inputProps={{ min: 0 }}
              />
              <Box sx={{ gridColumn: "1 / -1" }}>
                <TextField
                  fullWidth
                  label="Partials (comma-separated)"
                  value={config.oscillator.partials.join(", ")}
                  onChange={(e) => handlePartialsChange(e.target.value)}
                  helperText="Enter partial amplitudes separated by commas (e.g., 1, 0.6, 0.4)"
                />
              </Box>
            </Box>
          )}

          {activeTab === 2 && (
            <Box sx={fieldGridSx}>
              <NumberField
                label="Attack"
                value={config.envelope.attack}
                onChange={(value) => updateEnvelope("attack", value)}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <SelectField
                label="Attack Curve"
                value={config.envelope.attackCurve}
                onChange={(value) => updateEnvelope("attackCurve", value)}
                options={CURVE_TYPES}
              />
              <NumberField
                label="Decay"
                value={config.envelope.decay}
                onChange={(value) => updateEnvelope("decay", value)}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <SelectField
                label="Decay Curve"
                value={config.envelope.decayCurve}
                onChange={(value) => updateEnvelope("decayCurve", value)}
                options={CURVE_TYPES}
              />
              <NumberField
                label="Sustain"
                value={config.envelope.sustain}
                onChange={(value) => updateEnvelope("sustain", value)}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
              />
              <NumberField
                label="Release"
                value={config.envelope.release}
                onChange={(value) => updateEnvelope("release", value)}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <Box sx={{ gridColumn: "1 / -1" }}>
                <SelectField
                  label="Release Curve"
                  value={config.envelope.releaseCurve}
                  onChange={(value) => updateEnvelope("releaseCurve", value)}
                  options={CURVE_TYPES}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </ConfirmDialog>
  );
};
