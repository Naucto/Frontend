import React, { useMemo, useRef, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { EditorManager, EditorManagerProvider } from "@modules/editor/EditorManager";

import { CodeEditor } from "@modules/editor/CodeEditor/CodeEditor";
import { MapEditor } from "@modules/editor/MapEditor/MapEditor";
import { SoundEditor } from "@modules/editor/SoundEditor/SoundEditor";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import { styled } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import Create from "@modules/create/Create";
import { ThemeProvider } from "@mui/material";
import { useUser } from "src/providers/UserProvider";
import { TabData } from "@modules/editor/tab/TabData";
import { muiTheme } from "@theme/MUITheme";

const Container = styled("div")(({ theme }) => ({
  minHeight: "100vh",
  minWidth: "100vw",
  margin: 0,
  padding: 0,
  position: "absolute",
  backgroundColor: theme.palette.background.default
}));

function App() {
  // temporary for example

  const editorManagerRef = useRef(new EditorManager());

  const editorManager = useMemo(() => {
    const manager = editorManagerRef.current;
    manager.addEditor(CodeEditor, { title: "Code", icon: "code" });
    manager.addEditor(MapEditor, { title: "Map", icon: "map" });
    manager.addEditor(SoundEditor, { title: "Sound", icon: "sound" });
    manager.addEditor(SpriteEditor, { title: "Sprite", icon: "sprite" });
    return manager;
  }, []);

  return (
    <EditorManagerProvider value={editorManager}>
      <ThemeProvider theme={muiTheme}>
        <Container>
          <BrowserRouter>
            <NavBar />
            <Routes>
              <Route path="/" element={<Hub />} />
              <Route path="/hub" element={<Hub />} />
              <Route path='/create' element={<Create />} />
              {/* <Route path="/editor" element={editorManager.render()} /> */}
            </Routes>
          </BrowserRouter>
        </Container>
      </ThemeProvider>
    </EditorManagerProvider>
  );
}

export default App;
