export {
  GamePackageError,
  type GamePackageErrorCode,
} from "./errors.js";
export type {
  GameEntryV1,
  InitialFrameTargetV1,
  SubsystemDescriptorV1,
  ValidatedGameEntryV1,
} from "./model.js";
export { parseGameEntryV1, validateGameEntryV1 } from "./validate.js";
