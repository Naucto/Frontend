import React from "react";
import { ProgressBarProps } from "../types/SoundEditor.types";
import {
  ProgressBarContainer,
  ProgressBarTrack,
  ProgressBarFill,
  ProgressBarThumb,
} from "../styles/ProgressBar.styles";

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  onSeek,
  totalLength,
  maxLength,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const columnWidth = rect.width / totalLength;
    const column = Math.floor(x / columnWidth);
    const position = Math.max(0, Math.min(maxLength - 1, column));
    onSeek(position);
  };

  const cappedProgress = Math.min(progress, maxLength - 1);
  const columnCenterPosition = totalLength > 0 ? ((cappedProgress + 0.5) / totalLength) * 100 : 0;
  const fillPercentage = totalLength > 0 && maxLength > 0 ? ((cappedProgress + 1) / maxLength) * (maxLength / totalLength) * 100 : 0;

  return (
    <ProgressBarContainer onClick={handleClick}>
      <ProgressBarTrack>
        <ProgressBarFill width={`${fillPercentage}%`} />
        <ProgressBarThumb left={`${columnCenterPosition}%`} />
      </ProgressBarTrack>
    </ProgressBarContainer>
  );
};

