import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { FC } from "react";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
}
