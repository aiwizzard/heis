import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getXaiConfiguration, resolveXaiVariant } from "./xaiModels";

export const xaiParameters = createNativeVideoParameters({
  getConfiguration: getXaiConfiguration,
  resolveVariant: resolveXaiVariant,
});
