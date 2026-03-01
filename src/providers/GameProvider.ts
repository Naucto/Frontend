import * as Y from "yjs";
import { ApiError, ProjectsService } from "@api";
import { decodeUpdate } from "@utils/YSerialize.ts";
import { SpriteProvider } from "./editors/SpriteProvider.ts";
import { MapProvider } from "./editors/MapProvider.ts";
import { ProjectSettingsProvider } from "./editors/ProjectSettingsProvider.ts";

export enum ProviderEventType {
  INITIALIZED
}

class ReleaseContentFetchError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`Failed to fetch release content from ${url}: ${status}`);
    this.name = "ReleaseContentFetchError";
  }
}

export class GameProvider implements Destroyable {
  private readonly _doc: Y.Doc;

  private _listeners : Map<ProviderEventType, Set<() => void>> = new Map();
  private _initialized: boolean = false;

  public isHost: boolean;
  public code!: string;
  public sprite!: SpriteProvider;
  public map!: MapProvider;
  public projectSettings!: ProjectSettingsProvider;
  public projectId: number;

  constructor(projectId: number) {
    this.projectId = projectId;
    this.isHost = false;
    this._doc = new Y.Doc();

    this.initializeDoc().then(() => {
      this.code = this._doc.getText("monaco").toString();
      this.sprite = new SpriteProvider(this._doc);
      this.map = new MapProvider(this._doc, { width:128, height:32 }, 2, this.sprite);
      this._initialized = true;

      this.emit(ProviderEventType.INITIALIZED);

    });
  }

  private async initializeDoc(): Promise<void> {
    try {
      const signed = await ProjectsService.projectControllerGetReleaseContentUrl(
        String(this.projectId)
      );
      if (signed?.signedUrl) {
        try {
          let requestUrl = signed.signedUrl;
          if (typeof window !== "undefined") {
            try {
              const url = new URL(signed.signedUrl);
              if (url.hostname.endsWith(".svc.edge.scw.cloud")) {
                url.searchParams.set("cors_bust", Date.now().toString());
                requestUrl = url.toString();
              }
            } catch {
              requestUrl = signed.signedUrl;
            }
          }

          const response = await fetch(requestUrl);
          if (!response.ok) {
            throw new ReleaseContentFetchError(response.status, requestUrl);
          }
          const blob = await response.blob();
          await decodeUpdate(this._doc, blob);
          return;
        } catch {
          console.warn("Failed to fetch release content with signed URL, falling back to API endpoint");
        }
      }

      const content = await ProjectsService.projectControllerGetReleaseContent(
        String(this.projectId)
      );
      await decodeUpdate(this._doc, content);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 404) {
        // FIXME new project: nothing to load; optionally could seed defaults here
        console.error("Failed to fetch project content:", error);
      } else {
        throw error;
      }
    }
  }

  destroy(): void {
    if (this.sprite) {
      this.sprite.destroy();
    }
    if (this.map) {
      this.map.destroy();
    }
    this._doc.destroy();
  }

  public observe(event: ProviderEventType, callback: () => void): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(callback);

    if (event === ProviderEventType.INITIALIZED && this._initialized) {
      callback();
    }
  }

  emit(event: ProviderEventType): void {
    this._listeners.get(event)?.forEach(callback => callback());
  }
}
