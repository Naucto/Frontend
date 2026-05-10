import { type EngineUser } from "src/types/userTypes";

export type AwarenessChanges = {
  added: number[];
  updated: number[];
  removed: number[];
};

function escapeCssContent(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function createRemoteSelectionStyles(
  clientId: number,
  name: string,
  color: string,
  fontFamily: string,
): string {
  const rgba = `${color}33`;

  return `
      .yRemoteSelection-${clientId} {
        background-color: ${rgba} !important;
      }
      
      .yRemoteSelectionHead-${clientId} {
        border-left: ${color} solid 2px !important;
        border-top: ${color} solid 2px !important;
        border-bottom: ${color} solid 2px !important;
      }
      
      .yRemoteSelectionHead-${clientId}::before {
        content: '' !important;
        position: absolute !important;
        top: -15px !important;
        left: -15px !important;
        width: 50px !important;
        height: 35px !important;
        z-index: 999 !important;
        background: transparent !important;
        border: 10px solid transparent !important;
      }
      
      .yRemoteSelectionHead-${clientId}::after {
        border: 3px solid ${color} !important;
        content: '${escapeCssContent(name)}' !important;
        background-color: ${color} !important;
        color: white !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        font-family: ${fontFamily} !important;
        white-space: nowrap !important;
        position: absolute !important;
        top: -25px !important;
        left: -4px !important;
        z-index: 1000 !important;
        opacity: 0 !important;
        transform: translateY(10px) !important;
        transition: opacity 0.2s ease, transform 0.2s ease !important;
      }
      
      .yRemoteSelectionHead-${clientId}:hover::after {
        opacity: 1 !important;
        transform: translateY(0px) !important;
      }
    `;
}

export function createRemoteUsersStyles(
  users: EngineUser[],
  fontFamily: string,
  changes?: AwarenessChanges,
): string {
  const styleMap = new Map<number, string>();

  users.forEach((user) => {
    styleMap.set(user.clientId, createRemoteSelectionStyles(user.clientId, user.name, user.color, fontFamily));
  });

  changes?.removed.forEach((clientId) => {
    styleMap.delete(clientId);
  });

  return Array.from(styleMap.values()).join("\n");
}
