export interface DesktopHostLifecycleSource {
  close(): void;
}

export async function connectDesktopHostLifecycle(
  endpoint: string,
  target: Pick<Window, "document" | "addEventListener" | "removeEventListener">,
  WebSocketConstructor: typeof WebSocket = WebSocket,
): Promise<DesktopHostLifecycleSource> {
  const socket = new WebSocketConstructor(endpoint);
  await new Promise<void>((resolve, reject) => {
    const opened = () => { socket.removeEventListener("error", failed); resolve(); };
    const failed = () => { socket.removeEventListener("open", opened); reject(new Error("Desktop Host lifecycle endpoint unavailable")); };
    socket.addEventListener("open", opened, { once: true });
    socket.addEventListener("error", failed, { once: true });
  });
  let closed = false;
  let last: "background" | "foreground" | undefined;
  const publish = () => {
    if (closed || socket.readyState !== WebSocketConstructor.OPEN) return;
    const state = target.document.visibilityState === "hidden" ? "background" : "foreground";
    if (state === last) return;
    last = state;
    socket.send(JSON.stringify({ formatVersion: 1, type: "host.lifecycle", state }));
  };
  target.document.addEventListener("visibilitychange", publish);
  publish();
  return Object.freeze({
    close() {
      if (closed) return;
      closed = true;
      target.document.removeEventListener("visibilitychange", publish);
      socket.close(1000);
    },
  });
}
