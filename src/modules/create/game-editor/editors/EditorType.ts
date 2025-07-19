import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { FC } from "react";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
  onGetData?: (getData: () => string) => void;
  onSetData?: (setData: (data: string) => void) => void;
};

export interface EditorTab {
  label: string;
  component: FC<EditorProps>;
  getData?: () => string;
  setData?: (data: string) => void;
}
