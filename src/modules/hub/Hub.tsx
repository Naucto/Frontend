import { useTheme } from "@theme/ThemeContext";
import styled from "styled-components";

const HubContainer = styled.div<{ theme: any }>`
    padding: 0;
`;

export const Hub = () => {
  return (
    <HubContainer />
  );
};
