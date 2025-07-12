import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
  onGetData?: (getData: () => string) => void;
  onSetData?: (setData: (data: string) => void) => void;
};

export interface EditorTab {
  label: string;
  component: React.FC<EditorProps>;
  getData?: () => string;
  setData?: (data: string) => void;
}
