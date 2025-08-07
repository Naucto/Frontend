import React, { createContext, useContext, ReactNode, useReducer, Dispatch, useEffect } from "react";
import { ContextError } from "src/errors/ContextError";
import { Project } from "../types/ProjectType";
import { SpriteSheet } from "src/types/SpriteSheetType";

type Action =
  | { type: "SET_PROJECT"; payload: Project | undefined }
  | { type: "SET_SPRITESHEET"; payload: SpriteSheet };

interface ProjectContextType {
  project?: Project;
  dispatch: Dispatch<Action>;
}

function reducer(project: Project | undefined, action: Action): Project | undefined {
  switch (action.type) {
    case "SET_PROJECT":
      return action.payload;
    case "SET_SPRITESHEET":
      if (!project) return project;
      return { ...project, spriteSheet: action.payload };
    default:
      return project;
  }
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ project?: Project, children: ReactNode }> = ({ project, children }) => {
  const [state, dispatch] = useReducer(reducer, project);

  useEffect(() => {
    if (project) {
      dispatch({ type: "SET_PROJECT", payload: project });
    }
  }, [project]);

  return (
    <ProjectContext.Provider value={{ project: state, dispatch }}>
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
