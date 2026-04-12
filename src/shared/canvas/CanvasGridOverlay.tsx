import React from "react";
import { styled } from "@mui/material/styles";

type CanvasGridOverlayProps = {
  columns: number;
  rows: number;
  lineColor?: string;
  className?: string;
};

const GridOverlayRoot = styled("div", {
  shouldForwardProp: (prop) => !["$columns", "$rows", "$lineColor"].includes(String(prop)),
})<{ $columns: number; $rows: number; $lineColor: string }>(({ $columns, $rows, $lineColor }) => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage: `
    linear-gradient(to right, ${$lineColor} 1px, transparent 1px),
    linear-gradient(to bottom, ${$lineColor} 1px, transparent 1px)
  `,
  backgroundSize: `
    calc(100% / ${$columns}) 100%,
    100% calc(100% / ${$rows})
  `,
}));

export const CanvasGridOverlay: React.FC<CanvasGridOverlayProps> = ({
  columns,
  rows,
  lineColor = "rgba(255, 255, 255, 0.20)",
  className,
}) => (
  <GridOverlayRoot
    className={className}
    $columns={columns}
    $rows={rows}
    $lineColor={lineColor}
  />
);

export default CanvasGridOverlay;
