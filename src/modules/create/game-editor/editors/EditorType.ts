import { FC } from "react";
import { EngineProvider } from "src/providers/EngineProvider";

export type EditorProps = {
  provider: EngineProvider;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
}
