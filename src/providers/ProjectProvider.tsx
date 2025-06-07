import React, { createContext, useContext, useState, ReactNode } from "react";
import { ContextError } from "src/errors/ContextError";

interface ProjectType {
  name: string;
  shortDesc?: string;
  iconUrl?: string;
}

interface ProjectContextType {
  project: ProjectType;
  setProject: (p: ProjectType) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<ProjectContextType & { children: ReactNode }> =
({ project, setProject, children }) => {
  console.log("ProjectProvider mounted");
  return (
    <ProjectContext.Provider value={{ project, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new ContextError("useProject", "ProjectProvider");
  }
  return context;
};
