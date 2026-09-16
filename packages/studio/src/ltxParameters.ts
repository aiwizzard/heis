import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getLtxConfiguration, resolveLtxVariant } from "./ltxModels";

export const ltxParameters = createNativeVideoParameters({
  getConfiguration: getLtxConfiguration,
  resolveVariant: resolveLtxVariant,
});
