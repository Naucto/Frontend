import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { styled, ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import GameEditor from "@modules/create/game-editor/GameEditor";

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/hub" element={<Hub />} />
          <Route path='/create' element={<GameEditor />} />
          {/* <Route path="/editor" element={editorManager.render()} /> */}
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
