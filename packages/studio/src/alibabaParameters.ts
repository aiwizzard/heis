import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getAlibabaConfiguration, resolveAlibabaVariant } from "./alibabaModels";

export const alibabaParameters = createNativeVideoParameters({
  getConfiguration: getAlibabaConfiguration,
  resolveVariant: resolveAlibabaVariant,
});
