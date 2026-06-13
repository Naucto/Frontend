import { ControlButtonsContainer, StyledButton } from "../styles/SoundEditor.styles";
import { ControlButtonsProps } from "../types/SoundEditor.types";

import React from "react";

export const ControlButtons: React.FC<ControlButtonsProps> = ({
  isPlaying,
  onPlay,
  onStop,
  onClear,
}) => (
  <ControlButtonsContainer>
    <StyledButton onClick={isPlaying ? onStop : onPlay}>
      {isPlaying ? "Stop" : "Play"}
    </StyledButton>
    <StyledButton onClick={onClear}>Clear</StyledButton>
  </ControlButtonsContainer>
);

