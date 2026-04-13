import React from "react";
import { Box } from "@mui/material";
import { InstrumentButtonsProps } from "../types/SoundEditor.types";
import { ButtonContainer, StyledButton } from "../styles/SoundEditor.styles";

export const InstrumentButtons: React.FC<InstrumentButtonsProps> = ({
  instruments,
  currentInstrument,
  onInstrumentSelect,
  customInstruments,
  onEdit,
  onDelete,
}) => {
  const isCustomInstrument = customInstruments.has(currentInstrument);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <ButtonContainer>
        {Array.from(instruments.keys()).map((instrument) => (
          <StyledButton
            selected={currentInstrument === instrument}
            key={instrument}
            onClick={() => onInstrumentSelect(instrument)}
            style={{ width: "100%" }}
          >
            {instruments.get(instrument)}
          </StyledButton>
        ))}
      </ButtonContainer>
      {isCustomInstrument && onEdit && onDelete && (
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <StyledButton
            onClick={() => onEdit(currentInstrument)}
            style={{ backgroundColor: "#4caf50", borderColor: "#45a049" }}
          >
            Edit
          </StyledButton>
          <StyledButton
            onClick={() => onDelete(currentInstrument)}
            style={{ backgroundColor: "#f44336", borderColor: "#da190b" }}
          >
            Delete
          </StyledButton>
        </Box>
      )}
    </Box>
  );
};

