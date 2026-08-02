import { MusicSelectionButton, MusicSelectionContainer } from "../styles/SoundEditor.styles";
import { MusicSelectionButtonsProps } from "../types/SoundEditor.types";

import React from "react";

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

