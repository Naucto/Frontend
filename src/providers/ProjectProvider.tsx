import React, { createContext, useContext, ReactNode } from "react";
import { ContextError } from "src/errors/ContextError";
import { Project } from "../types/ProjectType";

interface ProjectContextType {
  project: Project | undefined;
  setProject: (p: Project | undefined) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<ProjectContextType & { children: ReactNode }> =
({ project, setProject, children }) => {
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
