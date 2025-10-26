import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GameEditor from "@modules/create/game-editor/GameEditor";
import { ProjectProvider, ProviderEventType } from "@providers/ProjectProvider";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [ showEditor, setShowEditor ] = useState(false);
  const [ project, setProject ] = useState<ProjectProvider>();

  useEffect(() => {
    if (projectId)
      setProject(new ProjectProvider(Number(projectId)));
  }, [projectId]);

  useEffect(() => {
    if (!project)
      return;
    project.observe(ProviderEventType.INITIALIZED, () => setShowEditor(true));
  }, [ project ]);

  return (
    <>
      { showEditor && <GameEditor project={project} /> }
    </>
  );
};

export default Project;
