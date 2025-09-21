import { FC } from "react";
import { ProjectProvider } from "../../../../providers/ProjectProvider.ts";

export type EditorProps = {
  provider: ProjectProvider;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
}
