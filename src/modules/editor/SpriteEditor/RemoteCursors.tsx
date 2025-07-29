import React, { use, useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { WebrtcProvider } from "y-webrtc";
import { PerfectCursor } from "perfect-cursors";
import "./RemoteCursors.css";

interface CursorPosition {
  x: number;
  y: number;
}

interface RemoteUser {
  name: string;
  color: string;
  userId: string;
  cursor?: CursorPosition;
}

interface RemoteCursorsProps {
  provider: WebrtcProvider;
  containerRef: React.RefObject<HTMLDivElement>;
  isActiveTab?: boolean;
}

function usePerfectCursor(cb: (point: number[]) => void, point?: number[]) {
  const [pc] = useState(() => new PerfectCursor(cb));

  useLayoutEffect(() => {
    if (point) pc.addPoint(point);
    return () => pc.dispose();
  }, [pc, point]);

  const onPointChange = useCallback(
    (point: number[]) => pc.addPoint(point),
    [pc]
  );

  return onPointChange;
}

const THROTTLE_DELAY = 80; // 80ms throttling

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ provider, containerRef, isActiveTab }) => {
  const [remoteUsers, setRemoteUsers] = useState<Map<number, RemoteUser>>(new Map());
  const lastSentTime = useRef<number>(0);
  const currentUserId = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  const awarenessHandlerRef = useRef<((changes: any) => void) | null>(null);

  useEffect(() => {
    if (provider?.awareness) {
      currentUserId.current = provider.awareness.clientID;
    }

    return () => {
      isMounted.current = false;
    };
  }, [provider]);

  const sendCursorPosition = (x: number, y: number) => {
    if (!provider?.awareness || !isMounted.current || !isActiveTab) {
      return;
    }

    const now = Date.now();
    if (now - lastSentTime.current < THROTTLE_DELAY) return;

    lastSentTime.current = now;

    try {
      provider.awareness.setLocalStateField("cursor", {
        x: x,
        y: y
      });
    } catch (error) {
      console.error("Error sending cursor position:", error); // FIXME
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.current || !provider?.awareness || !isMounted.current) return;

    try {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      const relativeX = (e.clientX - rect.left) / rect.width;
      const relativeY = (e.clientY - rect.top) / rect.height;

      if (isNaN(relativeX) || isNaN(relativeY) ||
          !isFinite(relativeX) || !isFinite(relativeY)) return;

      sendCursorPosition(relativeX, relativeY);
    } catch (error) {
      console.error("Error handling mouse move:", error);
    }
  };

  const handleMouseLeave = () => {
    if (!provider?.awareness || !isMounted.current) return;

    try {
      provider.awareness.setLocalStateField("cursor", null);
    } catch (error) {
      console.error("Error clearing cursor position:", error);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !provider?.awareness) return;

    const container = containerRef.current;

    if (!container) return;

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }

      if (provider?.awareness && isMounted.current) {
        try {
          provider.awareness.setLocalStateField("cursor", null);
        } catch (error) {
          console.error("Error cleaning up cursor on unmount:", error);
        }
      }
    };
  }, [containerRef, provider]);

  useEffect(() => {
    if (!provider?.awareness) return;

    const handleAwarenessChange = (changes: { added: number[], updated: number[], removed: number[] }) => {
      if (!isMounted.current) return;

      try {
        const states = provider.awareness.getStates();
        const updatedUsers = new Map<number, RemoteUser>();

        states.forEach((state, clientId) => {
          if (clientId === currentUserId.current) return;

          if (state.user && state.cursor) {
            updatedUsers.set(clientId, {
              name: state.user.name || "Anonymous",
              color: state.user.color || "#ff0000",
              userId: state.user.userId || String(clientId),
              cursor: {
                x: state.cursor.x,
                y: state.cursor.y,
              }
            });
          }
        });

        if (isMounted.current) {
          setRemoteUsers(updatedUsers);
        }
      } catch (error) {
        console.error("Error handling awareness change:", error);
      }
    };

    awarenessHandlerRef.current = handleAwarenessChange;
    provider.awareness.on("change", handleAwarenessChange);

    return () => {
      if (provider.awareness && awarenessHandlerRef.current) {
        try {
          provider.awareness.off("change", awarenessHandlerRef.current);
        } catch (error) {
          console.error("Error removing awareness listener:", error);
        }
      }
    };
  }, [provider]);

  useEffect(() => {
    return () => {
      if (provider?.awareness && isMounted.current) {
        try {
          provider.awareness.setLocalStateField("cursor", null);
        } catch (error) {
          console.error("Error cleaning up cursor:", error);
        }
      }
    };
  }, [provider]);

  useEffect(() => {
    if (!isActiveTab && provider?.awareness && isMounted.current) {
      try {
        provider.awareness.setLocalStateField("cursor", null);
      } catch (error) {
        console.error("Error clearing cursor on tab change:", error);
      }
    }
  }, [isActiveTab, provider]);

  if (!containerRef.current || !provider?.awareness || !isActiveTab) {
    return null;
  }

  return (
    <div className="cursor-overlay">
      {Array.from(remoteUsers.entries()).map(([clientId, user]) => (
        user.cursor && (
          <RemoteCursor
            key={clientId}
            user={user}
            containerRef={containerRef}
          />
        )
      ))}
    </div>
  );
};

interface RemoteCursorProps {
  user: RemoteUser;
  containerRef: React.RefObject<HTMLDivElement>;
}

const RemoteCursor: React.FC<RemoteCursorProps> = ({ user, containerRef }) => {
  const cursorContainerRef = useRef<HTMLDivElement>(null);
  const lastPoint = useRef<[number, number] | null>(null);

  const animateCursor = useCallback((point: number[]) => {
    const elm = cursorContainerRef.current;
    if (!elm) return;
    elm.style.setProperty(
      "transform",
      `translate(${point[0]}px, ${point[1]}px)`
    );
  }, []);

  const onPointMove = usePerfectCursor(animateCursor);

  useEffect(() => {
    if (!containerRef.current || !user.cursor) return;

    try {
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      const absoluteX = user.cursor.x * rect.width;
      const absoluteY = user.cursor.y * rect.height;

      if (isNaN(absoluteX) || isNaN(absoluteY) ||
          !isFinite(absoluteX) || !isFinite(absoluteY)) return;

      const newPoint: [number, number] = [absoluteX, absoluteY];
      lastPoint.current = newPoint;

      onPointMove(newPoint);
    } catch (error) {
      console.error("Error updating cursor position:", error);
    }
  }, [user.cursor, containerRef, onPointMove]);

  return (
    <div
      ref={cursorContainerRef}
      className="remote-cursor-container"
      style={{
        position: "absolute",
        top: -10, // Adjusted to center the cursor icon (not perfect)
        left: -10, // Adjusted to center the cursor icon (not perfect)
        pointerEvents: "none"
      }}
    >
      <svg
        style={{
          width: 35,
          height: 35,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))",
        }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 35 35"
        fill="none"
        fillRule="evenodd"
      >
        <g fill="rgba(0,0,0,.2)" transform="translate(1,1)">
          <path d="m12 24.4219v-16.015l11.591 11.619h-6.781l-.411.124z" />
          <path d="m21.0845 25.0962-3.605 1.535-4.682-11.089 3.686-1.553z" />
        </g>
        <g fill="white">
          <path d="m12 24.4219v-16.015l11.591 11.619h-6.781l-.411.124z" />
          <path d="m21.0845 25.0962-3.605 1.535-4.682-11.089 3.686-1.553z" />
        </g>
        <g fill={user.color}>
          <path d="m19.751 24.4155-1.844.774-3.1-7.374 1.841-.775z" />
          <path d="m13 10.814v11.188l2.969-2.866.428-.139h4.768z" />
        </g>
      </svg>
      <div
        className="cursor-label"
        style={{
          backgroundColor: user.color,
          position: "absolute",
          top: -30,  // username label above the cursor
          left: 0,
          padding: "3px 8px",
          borderRadius: "4px",
          color: "white",
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          pointerEvents: "none",
          transform: "translateX(-50%)",  // Center label horizontally
          marginLeft: 15  // Slight offset to align with cursor
        }}
      >
        {user.name}
      </div>
    </div>
  );
};
