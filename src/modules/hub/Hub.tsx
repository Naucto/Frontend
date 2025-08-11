import { styled } from "@mui/material/styles";
import { JSX } from "react";

const HubContainer = styled("div")(() => ({
  padding: 0,
}));

export const Hub = (): JSX.Element => {
  return (
    <HubContainer />
  );
};
