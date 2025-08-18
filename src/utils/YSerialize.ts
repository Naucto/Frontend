import * as Y from "yjs";

export const encodeUpdate = (doc: Y.Doc): Uint8Array => {
  return Y.encodeStateAsUpdate(doc);
};

const fromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const decodeUpdate = (doc: Y.Doc, data: Uint8Array | ArrayBuffer | Blob | string): Promise<void> | void => {
  const apply = (u: Uint8Array): void => {
    if (u.byteLength === 0) return;
    Y.applyUpdate(doc, u);
  };

  console.log(data);

  if (data instanceof Uint8Array) return apply(data);
  if (data instanceof ArrayBuffer) return apply(new Uint8Array(data));
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.arrayBuffer().then(buf => apply(new Uint8Array(buf)));
  }
  if (typeof data === "string") {
    return apply(fromBase64(data));
  }
  throw new Error("Unsupported update payload type");
};
