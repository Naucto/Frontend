# Node consumers

`@naucto/engine/headless` exposes the game document model and AI context projection without
loading the browser runtime. `@naucto/engine/sound` exposes offline synthesis and audio conversion.
The frontend keeps using the existing source entry point.

Run `npm run pack:node -w packages/engine` from the monorepo after committing engine changes.
Set `NAUCTO_PACK_DIR` to select the archive destination. The build emits ESM, CommonJS and
declarations, smoke-tests both module systems in Node, then packs a Node-only distribution of
this same package. Its version and `engineSource` record the Frontend source commit.

The Backend and Naucto-AI keep the identical archive under `vendor/` and install it using a
locked `file:vendor/...tgz` dependency. This needs neither registry credentials nor a neighbouring
Frontend checkout in CI or Docker. To upgrade, build from the desired committed Frontend revision,
replace the archive in both consumers and run `npm install ./vendor/<archive>`. Do not edit the
archive or maintain separate copies of the engine source in consumers.

Yjs stays external to the bundles, so the engine and the host use the same Yjs instance.
