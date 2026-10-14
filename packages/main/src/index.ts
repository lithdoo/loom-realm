export { MainRuntimeFatalError } from "./errors.js";
export { runMainInternal as runMain } from "./internal/main-session.js";
export type {
  LogicalGameBootstrap,
  MainFrameFailure,
  MainFrameOutcome,
  MainPlatform,
  MainPolicy,
  MainRuntimeFailure,
  MainRealmStateFatalSource,
  MainSessionEventsFatalSource,
  MainSessionResult,
  RunMainOptions,
} from "./model.js";
