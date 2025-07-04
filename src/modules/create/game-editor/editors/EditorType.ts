import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

export type EditorProps = {
  ydoc: Y.Doc;
  provider: WebrtcProvider;
};
