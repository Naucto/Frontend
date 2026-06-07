import { FC, ReactElement } from "react";
import { ProjectProvider } from "@providers/ProjectProvider";

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
