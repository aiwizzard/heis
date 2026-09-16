import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getKlingConfiguration, getKlingVariants, resolveKlingVariant } from "./klingModels";

export const klingParameters = createNativeVideoParameters({
  getConfiguration: getKlingConfiguration,
  resolveVariant: resolveKlingVariant,
  getResolutionVariants: getKlingVariants,
});
