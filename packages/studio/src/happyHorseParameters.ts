import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getHappyHorseConfiguration, getHappyHorseVariants, resolveHappyHorseVariant } from "./happyHorseModels";

export const happyHorseParameters = createNativeVideoParameters({
  getConfiguration: getHappyHorseConfiguration,
  resolveVariant: resolveHappyHorseVariant,
  getResolutionVariants: getHappyHorseVariants,
});
