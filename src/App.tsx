import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import Projects from "@modules/projects/Projects";
import Project from "@modules/project/Project";

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/hub" element={<Hub />} />
          <Route path='/projects' element={<Projects />} />
          <Route path="/projects/:projectId" element={<Project />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider >
  );
}

export default App;
