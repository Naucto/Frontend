import { FC, ReactElement } from "react";
import { ProjectProvider } from "@providers/ProjectProvider";

export type EditorProps = {
  project: ProjectProvider;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
  icon: ReactElement;
}
