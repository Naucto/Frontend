import React from "react";
import { MusicSelectionButtonsProps } from "../types/SoundEditor.types";
import { MusicSelectionContainer, MusicSelectionButton } from "../styles/SoundEditor.styles";

export const MusicSelectionButtons: React.FC<MusicSelectionButtonsProps> = ({
  musics,
  selectedMusicIndex,
  onMusicSelect,
}) => (
  <MusicSelectionContainer>
    {musics.map((_, index) => (
      <MusicSelectionButton
        selected={selectedMusicIndex === index}
        key={index}
        onClick={() => onMusicSelect(index)}
      >
        {index + 1}
      </MusicSelectionButton>
    ))}
  </MusicSelectionContainer>
);

