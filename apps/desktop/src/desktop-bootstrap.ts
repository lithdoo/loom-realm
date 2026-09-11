export const DESKTOP_BOOTSTRAP_CHANNEL = "loomrealm.desktop.renderer-bootstrap/1";

export interface DesktopRendererBootstrapEnvelope {
  readonly channel: typeof DESKTOP_BOOTSTRAP_CHANNEL;
  readonly rendererControlToken: string;
  readonly content: {
    readonly origin: string;
    readonly installationId: string;
    readonly token: string;
  };
  readonly presentation: unknown;
}
