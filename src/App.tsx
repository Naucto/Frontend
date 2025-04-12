import React from "react"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"
import { ThemeProvider } from "@theme/ThemeContext"

import { Hub } from "@modules/hub/Hub"
import { SoundEditorBalise } from "@modules/editor/SoundEditor/SoundEditor"
function App() {
  return (
    <ThemeProvider>
      <SoundEditorBalise></SoundEditorBalise>
    </ThemeProvider>
  )
}

export default App
