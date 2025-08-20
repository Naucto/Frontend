import * as Y from "yjs";

export const encodeUpdate = (doc: Y.Doc): Uint8Array => {
  return Y.encodeStateAsUpdate(doc);
};

export const decodeUpdate = (doc: Y.Doc, data: Blob): Promise<void> | void => {
  const apply = (u: Uint8Array): void => {
    if (u.byteLength === 0) return;
    Y.applyUpdate(doc, u);
  };

  return data.arrayBuffer().then(buf => apply(new Uint8Array(buf)));
};
