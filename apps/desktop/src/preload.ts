import { ipcRenderer } from "electron";
import { DESKTOP_BOOTSTRAP_CHANNEL } from "./desktop-bootstrap.js";

ipcRenderer.once(DESKTOP_BOOTSTRAP_CHANNEL, (event, envelope: unknown) => {
  const ports = event.ports;
  if (ports.length !== 2) { for (const port of ports) port.close(); return; }
  window.postMessage(
    { channel: DESKTOP_BOOTSTRAP_CHANNEL, envelope },
    window.location.origin,
    ports,
  );
});
