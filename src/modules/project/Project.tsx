import Create from "@modules/create/Create";
import React from "react";
import { ProjectProvider } from "src/providers/ProjectProvider";

const Project: React.FC = () => {

  return (
    <>
      <ProjectProvider>
        <Create />
      </ProjectProvider>
    </>
  );
};

export default Project;
