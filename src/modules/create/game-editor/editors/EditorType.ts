import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
  onGetData?: (getData: () => string) => void;
};

export interface EditorTab {
  label: string;
  component: React.FC<EditorProps> | undefined;
  getData?: () => string;
}
