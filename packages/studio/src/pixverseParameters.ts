import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getPixVerseConfiguration, resolvePixVerseVariant } from "./pixverseModels";

export const pixverseParameters = createNativeVideoParameters({
  getConfiguration: getPixVerseConfiguration,
  resolveVariant: resolvePixVerseVariant,
});
