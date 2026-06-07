import { CreateProjectDto, projectControllerCreate } from "@api";
import * as urls from "@shared/route";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { useCallback, useState } from "react";

import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";

const DEFAULT_PROJECT: CreateProjectDto = {
  name: "Untitled Project",
  shortDesc: "A new Naucto game.",
  tags: [],
};

type UseCreateProjectResult = {
  createProject: () => Promise<void>;
  isCreatingProject: boolean;
};

export function useCreateProject(): UseCreateProjectResult {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const createProject = useCallback(async (): Promise<void> => {
    if (isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);
    try {
      const { data: newProject } = await projectControllerCreate({ body: DEFAULT_PROJECT });

      if (!newProject) {
        return;
      }

      LocalStorageManager.setProjectId(newProject.id);
      navigate(urls.toProject(newProject.id));
      enqueueSnackbar("New game created successfully!", { variant: "success" });
    } catch (error) {
      console.error("Error creating new project:", error);
      enqueueSnackbar("Failed to create a new game", { variant: "error" });
    } finally {
      setIsCreatingProject(false);
    }
  }, [enqueueSnackbar, isCreatingProject, navigate]);

  return { createProject, isCreatingProject };
}
