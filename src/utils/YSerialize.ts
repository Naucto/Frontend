import * as Y from "yjs";

export const encodeUpdate = (doc: Y.Doc): string => {
  const update = Y.encodeStateAsUpdate(doc);
  let binary = "";
  update.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
};

export const decodeUpdate = (data: string): Uint8Array => {
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};
