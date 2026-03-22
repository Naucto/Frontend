import React from "react";
import { ControlButtonsProps } from "../types/SoundEditor.types";
import { ControlButtonsContainer, StyledButton } from "../styles/SoundEditor.styles";

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

