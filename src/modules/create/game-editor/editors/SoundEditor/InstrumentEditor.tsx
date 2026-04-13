import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { styled } from "@mui/material/styles";

const StyledDialog = styled(Dialog)(() => ({
  "& .MuiDialog-paper": {
    minWidth: "600px",
    maxWidth: "800px",
    maxHeight: "90vh",
  },
}));

const StyledTextField = styled(TextField)(() => ({
  "& .MuiInputBase-input": {
    color: "black",
  },
}));

const StyledSelect = styled(Select)(() => ({
  "& .MuiSelect-select": {
    color: "black",
  },
  "& .MuiInputLabel-root": {
    color: "black",
  },
  "& .MuiMenuItem-root": {
    color: "black",
  },
}));

const StyledFormControl = styled(FormControl)(() => ({
  "& .MuiInputLabel-root": {
    color: "black",
  },
}));

const StyledInputLabel = styled(InputLabel)(() => ({
  color: "black",
}));

const StyledAccordionTitle = styled(Typography)(() => ({
  color: "black",
}));

const StyledMenuItem = styled(MenuItem)(() => ({
  color: "black",
}));

const StyledNameField = styled(TextField)(() => ({
  marginBottom: "16px",
  "& .MuiInputBase-input": {
    color: "black",
  },
}));

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  inputProps?: { min?: number; max?: number; step?: number };
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, inputProps }) => (
  <StyledTextField
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
  <StyledFormControl fullWidth>
    <StyledInputLabel>{label}</StyledInputLabel>
    <StyledSelect
      value={value}
      label={label}
      onChange={(e) => onChange(e.target.value as string)}
      MenuProps={{
        PaperProps: {
          sx: {
            "& .MuiMenuItem-root": {
              color: "black",
            },
          },
        },
      }}
    >
      {options.map((option) => (
        <StyledMenuItem key={option} value={option}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </StyledMenuItem>
      ))}
    </StyledSelect>
  </StyledFormControl>
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
    if (!instrumentName.trim()) {
      alert("Please enter an instrument name");
      return;
    }
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
    <StyledDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {editingInstrument ? "Edit Instrument" : "Create New Instrument"}
      </DialogTitle>
      <DialogContent>
        <Box style={{ marginTop: "16px" }}>
          <StyledNameField
            fullWidth
            variant="outlined"
            label="Instrument Name"
            value={instrumentName}
            onChange={(e) => {
              setInstrumentName(e.target.value);
            }}
            required
            autoFocus
          />

          <Accordion defaultExpanded>
            <AccordionSummary>
              <StyledAccordionTitle variant="h6">Basic Parameters</StyledAccordionTitle>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
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
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary>
              <StyledAccordionTitle variant="h6">Oscillator</StyledAccordionTitle>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
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
                  <StyledTextField
                    fullWidth
                    label="Partials (comma-separated)"
                    value={config.oscillator.partials.join(", ")}
                    onChange={(e) => handlePartialsChange(e.target.value)}
                    helperText="Enter partial amplitudes separated by commas (e.g., 1, 0.6, 0.4)"
                  />
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary>
              <StyledAccordionTitle variant="h6">Envelope</StyledAccordionTitle>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
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
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save
        </Button>
      </DialogActions>
    </StyledDialog>
  );
};

