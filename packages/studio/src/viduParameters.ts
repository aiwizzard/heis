import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getViduConfiguration, resolveViduVariant } from "./viduModels";

export const viduParameters = createNativeVideoParameters({
  getConfiguration: getViduConfiguration,
  resolveVariant: resolveViduVariant,
});
