import React from "react";
import { Editor } from "@monaco-editor/react";
import CodeTabTheme from "@modules/create/game-editor/editors/CodeTabTheme";
import Panel from "@modules/create/game-editor/Panel";
import { Box } from "@mui/material";
import "./monaco.css";

interface GameEditorConsoleProps {
  output: string;
}

const GameEditorConsole: React.FC<GameEditorConsoleProps> = ({ output }) => {
  return (
    <Panel title="Game Console">
      <Editor
        className="monaco"
        defaultLanguage="lua"
        theme={CodeTabTheme.MONACO_THEME_NAME}
        value={output}
        options={{
          lineNumbers: "off",
          lineDecorationsWidth: 0,
          minimap: {
            enabled: false
          },
          readOnly: true,
          readOnlyMessage: {
            value: "The console output cannot be edited."
          },
          automaticLayout: true
        }}
        defaultValue="// Game console output will appear here"
      />
    </Panel>
  );
};

export default GameEditorConsole;
