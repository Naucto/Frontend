import { ProjectProvider } from "@providers/ProjectProvider";

import { FC, ReactElement } from "react";

export type EditorProps = {
  project: ProjectProvider;
  consoleOutput?: string;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
  icon: ReactElement;
  disablePadding?: boolean;
}
