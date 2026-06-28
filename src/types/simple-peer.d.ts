// Import the prebuilt browser bundle (like y-webrtc does) rather than the Node
// entry, which references `global`/Buffer and throws under Vite. Reuse the
// @types/simple-peer typings for that path.
declare module "simple-peer/simplepeer.min.js" {
  const SimplePeer: typeof import("simple-peer");
  export default SimplePeer;
}
