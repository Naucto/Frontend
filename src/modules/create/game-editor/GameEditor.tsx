import React from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box } from "@mui/material";

const GameEditorContainer = styled("div")({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "row",
});

const LeftPanel = styled("div")({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
});

const RightPanel = styled("div")({
  width: "100%",
  height: "100%",
  backgroundColor: "gray",
});

const TabContent = styled(Box)({
  flex: 1,
  overflow: "auto",
  backgroundColor: "white",
});

const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  backgroundColor: "blue", //fixme: replace with MUI theme color
  padding: "20px, 0",
  fontSize: "1.2rem",
  borderTopLeftRadius: "8px", //fixme: replace with MUI theme rounded
  borderTopRightRadius: "8px", //fixme: replace with MUI theme rounded
  color: "white",
  opacity: 1,
  "&.Mui-selected": {
    backgroundColor: "blue", //fixme: replace with MUI theme color
  },
  "&:hover": {
    backgroundColor: "blue", //fixme: replace with MUI theme color
  },
}));
const GameEditor: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState(0);

  const tabs = ["code", "map", "sound", "sprite"];
  const editors = [
    <div>Code Editor</div>,
    <div>Map Editor</div>,
    <div>Sound Editor</div>,
    <div>Sprite Editor</div>,
  ];

  return (
    <GameEditorContainer>
      <LeftPanel>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          {tabs.map((label) => (
            <StyledTab key={label} label={label} />
          ))}
        </Tabs>
        <TabContent>
          {editors[activeTab]}
        </TabContent>
      </LeftPanel>

      <RightPanel>
        right
      </RightPanel>
    </GameEditorContainer>
  );
};

export default GameEditor;
