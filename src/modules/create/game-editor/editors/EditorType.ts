import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
  data: any;
  setData: (a: any) => void;
};

export interface EditorTab {
  label: string;
  component: React.FC<EditorProps> | React.ReactElement; // FIXME remove reactelement once all editors are here
}
