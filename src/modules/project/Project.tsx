import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ProjectResponseDto, ProjectsService } from "@api";
import { ProjectProvider } from "src/providers/ProjectProvider";
import GameEditor from "@modules/create/game-editor/GameEditor";
import { Project as ProjectType } from "../../types/ProjectType";
import { useAsync } from "src/hooks/useAsync";
import { palette, spriteTable } from "src/temporary/SpriteSheet";
import { SpriteSheet } from "../../types/SpriteSheetType";
import { mapData } from "src/temporary/map";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectType | undefined>(undefined);
  const { value } = useAsync<ProjectResponseDto | undefined>(async () => {
    if (projectId) {
      const project: ProjectResponseDto = await ProjectsService.projectControllerFindOne(parseInt(projectId));
      return project;
    }
    return undefined;
  }, [projectId]);

  useEffect(() => {
    if (value) {

      const spriteSheet: SpriteSheet = {
        spriteSheet: spriteTable.table,
        spriteSize: { width: 8, height: 8 },
        size: { width: 128, height: 128 },
        stride: 1,
      };
      const project: ProjectType = {
        ...value,
        //FIXME: should be replaced with api call which gives project including spritesheet
        spriteSheet: spriteSheet,
        map: {
          mapData: mapData,
          width: 128,
          height: 32,
          spriteSheet: spriteSheet,
          stride: 2,
        },
        palette: palette
      };
      setProject(project);
      console.log("Project loaded:", project);
    }
  }, [value, setProject]);

  return (
    <>
      <ProjectProvider project={project}>
        <GameEditor />
      </ProjectProvider>
    </>
  );
};

export default Project;
