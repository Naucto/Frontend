import React, { createContext, useContext, ReactNode, useReducer, useMemo, useEffect } from "react";
import { ContextError } from "src/errors/ContextError";
import { Project } from "../types/ProjectType";
import { SpriteSheet } from "src/types/SpriteSheetType";

type Action =
  | { type: "SET_PROJECT"; payload?: Project }
  | { type: "SET_SPRITESHEET"; payload: SpriteSheet }
  | { type: "SET_SPRITESHEET_DATA"; payload: string };

interface ProjectContextType {
  project?: Project;
  actions: {
    setProject: (newProject?: Project) => void;
    setSpriteSheet: (spriteSheet: SpriteSheet) => void;
    setSpriteSheetData: (data: string) => void;
  };
}

function _reducer(project: Maybe<Project>, action: Action): Maybe<Project> {
  switch (action.type) {
    case "SET_PROJECT":
      return action.payload;

    case "SET_SPRITESHEET":
      if (!project) return project;
      return {
        ...project,
        spriteSheet: action.payload,
        map: { ...project.map, spriteSheet: action.payload }
      };

    case "SET_SPRITESHEET_DATA":
    {
      if (!project || !project.spriteSheet) return project;
      const newSpriteSheet = {
        ...project.spriteSheet,
        spriteSheet: action.payload,
      };
      return {
        ...project,
        spriteSheet: newSpriteSheet,
        map: {
          ...project.map,
          spriteSheet: newSpriteSheet,
        },
      };
    }
    default:
      return project;
  }
}

const ProjectContext = createContext<Maybe<ProjectContextType>>(undefined);

export const ProjectProvider: React.FC<{ project?: Project, children: ReactNode }> = ({ project, children }) => {
  const [state, dispatch] = useReducer(_reducer, project);

  const actions = useMemo(
    () => ({
      setProject: (newProject?: Project) =>
        dispatch({ type: "SET_PROJECT", payload: newProject }),
      setSpriteSheet: (spriteSheet: SpriteSheet) =>
        dispatch({ type: "SET_SPRITESHEET", payload: spriteSheet }),
      setSpriteSheetData: (data: string) =>
        dispatch({ type: "SET_SPRITESHEET_DATA", payload: data }),
    }),
    [dispatch]
  );

  useEffect(() => {
    if (project) {
      actions.setProject(project);
    }
  }, [project, actions]);

  return (
    <ProjectContext.Provider value={{ project: state, actions }}>
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
