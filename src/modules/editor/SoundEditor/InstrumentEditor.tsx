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
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import "./InstrumentEditor.css";

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

  const handleSave = () => {
    if (!instrumentName.trim()) {
      alert("Please enter an instrument name");
      return;
    }
    onSave(instrumentName.trim(), config);
    onClose();
  };

  const updateConfig = (path: string[], value: any) => {
    setConfig((prev) => {
      const newConfig = { ...prev };
      let current: any = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] };
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  const updateOscillator = (field: string, value: any) => {
    updateConfig(["oscillator", field], value);
  };

  const updateEnvelope = (field: string, value: any) => {
    updateConfig(["envelope", field], value);
  };

  const handlePartialsChange = (value: string) => {
    try {
      const partials = value
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      updateOscillator("partials", partials);
      updateOscillator("partialCount", partials.length);
    } catch (e) {
      // Invalid input, ignore
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      className="instrument-editor-dialog"
    >
      <DialogTitle>
        {editingInstrument ? "Edit Instrument" : "Create New Instrument"}
      </DialogTitle>
      <DialogContent>
        <Box style={{ marginTop: "16px" }}>
          <TextField
            fullWidth
            variant="outlined"
            label="Instrument Name"
            value={instrumentName}
            onChange={(e) => {
              setInstrumentName(e.target.value);
            }}
            required
            className="instrument-editor-name-field"
            autoFocus
          />

          <Accordion defaultExpanded>
            <AccordionSummary>
              <Typography variant="h6" className="instrument-editor-accordion-title">Basic Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Volume"
                    value={config.volume.toString()}
                    onChange={(e) =>
                      updateConfig(["volume"], parseFloat(e.target.value) || 0)
                    }
                    inputProps={{ min: 0, max: 1, step: 0.1 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Detune (cents)"
                    value={config.detune.toString()}
                    onChange={(e) =>
                      updateConfig(["detune"], parseFloat(e.target.value) || 0)
                    }
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Portamento"
                    value={config.portamento.toString()}
                    onChange={(e) =>
                      updateConfig(
                        ["portamento"],
                        parseFloat(e.target.value) || 0
                      )
                    }
                    inputProps={{ min: 0, step: 0.1 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Harmonicity"
                    value={config.harmonicity.toString()}
                    onChange={(e) =>
                      updateConfig(
                        ["harmonicity"],
                        parseFloat(e.target.value) || 0
                      )
                    }
                    inputProps={{ min: 0, step: 0.1 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary>
              <Typography variant="h6" className="instrument-editor-accordion-title">Oscillator</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth className="instrument-editor-form-control">
                    <InputLabel className="instrument-editor-input-label">Type</InputLabel>
                    <Select
                      value={config.oscillator.type}
                      label="Type"
                      onChange={(e) =>
                        updateOscillator("type", e.target.value)
                      }
                      className="instrument-editor-select"
                      MenuProps={{
                        PaperProps: {
                          className: "instrument-editor-menu"
                        }
                      }}
                    >
                      <MenuItem value="sine">Sine</MenuItem>
                      <MenuItem value="square">Square</MenuItem>
                      <MenuItem value="sawtooth">Sawtooth</MenuItem>
                      <MenuItem value="triangle">Triangle</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth className="instrument-editor-form-control">
                    <InputLabel className="instrument-editor-input-label">Modulation Type</InputLabel>
                    <Select
                      value={config.oscillator.modulationType || "square"}
                      label="Modulation Type"
                      onChange={(e) =>
                        updateOscillator("modulationType", e.target.value)
                      }
                      className="instrument-editor-select"
                      MenuProps={{
                        PaperProps: {
                          className: "instrument-editor-menu"
                        }
                      }}
                    >
                      <MenuItem value="sine">Sine</MenuItem>
                      <MenuItem value="square">Square</MenuItem>
                      <MenuItem value="sawtooth">Sawtooth</MenuItem>
                      <MenuItem value="triangle">Triangle</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Phase"
                    value={config.oscillator.phase.toString()}
                    onChange={(e) =>
                      updateOscillator(
                        "phase",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Partial Count"
                    value={config.oscillator.partialCount.toString()}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 0;
                      updateOscillator("partialCount", count);
                      if (count > config.oscillator.partials.length) {
                        const newPartials = [
                          ...config.oscillator.partials,
                          ...Array(count - config.oscillator.partials.length).fill(
                            0
                          ),
                        ];
                        updateOscillator("partials", newPartials);
                      } else if (count < config.oscillator.partials.length) {
                        updateOscillator(
                          "partials",
                          config.oscillator.partials.slice(0, count)
                        );
                      }
                    }}
                    inputProps={{ min: 0 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Partials (comma-separated)"
                    value={config.oscillator.partials.join(", ")}
                    onChange={(e) => handlePartialsChange(e.target.value)}
                    helperText="Enter partial amplitudes separated by commas (e.g., 1, 0.6, 0.4)"
                    className="instrument-editor-text-field"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary>
              <Typography variant="h6" className="instrument-editor-accordion-title">Envelope</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Attack"
                    value={config.envelope.attack.toString()}
                    onChange={(e) =>
                      updateEnvelope(
                        "attack",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    inputProps={{ min: 0, step: 0.01 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth className="instrument-editor-form-control">
                    <InputLabel className="instrument-editor-input-label">Attack Curve</InputLabel>
                    <Select
                      value={config.envelope.attackCurve}
                      label="Attack Curve"
                      onChange={(e) =>
                        updateEnvelope("attackCurve", e.target.value)
                      }
                      className="instrument-editor-select"
                      MenuProps={{
                        PaperProps: {
                          className: "instrument-editor-menu"
                        }
                      }}
                    >
                      <MenuItem value="linear">Linear</MenuItem>
                      <MenuItem value="exponential">Exponential</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Decay"
                    value={config.envelope.decay.toString()}
                    onChange={(e) =>
                      updateEnvelope("decay", parseFloat(e.target.value) || 0)
                    }
                    inputProps={{ min: 0, step: 0.01 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth className="instrument-editor-form-control">
                    <InputLabel className="instrument-editor-input-label">Decay Curve</InputLabel>
                    <Select
                      value={config.envelope.decayCurve}
                      label="Decay Curve"
                      onChange={(e) =>
                        updateEnvelope("decayCurve", e.target.value)
                      }
                      className="instrument-editor-select"
                      MenuProps={{
                        PaperProps: {
                          className: "instrument-editor-menu"
                        }
                      }}
                    >
                      <MenuItem value="linear">Linear</MenuItem>
                      <MenuItem value="exponential">Exponential</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Sustain"
                    value={config.envelope.sustain.toString()}
                    onChange={(e) =>
                      updateEnvelope(
                        "sustain",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    inputProps={{ min: 0, max: 1, step: 0.1 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Release"
                    value={config.envelope.release.toString()}
                    onChange={(e) =>
                      updateEnvelope(
                        "release",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    inputProps={{ min: 0, step: 0.01 }}
                    className="instrument-editor-text-field"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth className="instrument-editor-form-control">
                    <InputLabel className="instrument-editor-input-label">Release Curve</InputLabel>
                    <Select
                      value={config.envelope.releaseCurve}
                      label="Release Curve"
                      onChange={(e) =>
                        updateEnvelope("releaseCurve", e.target.value)
                      }
                      className="instrument-editor-select"
                      MenuProps={{
                        PaperProps: {
                          className: "instrument-editor-menu"
                        }
                      }}
                    >
                      <MenuItem value="linear">Linear</MenuItem>
                      <MenuItem value="exponential">Exponential</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
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
    </Dialog>
  );
};

