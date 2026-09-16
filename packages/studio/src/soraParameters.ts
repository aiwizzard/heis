import { createNativeVideoParameters } from "./nativeVideoParameters";
import { getSoraConfiguration, resolveSoraVariant } from "./soraModels";

export const soraParameters = createNativeVideoParameters({
  getConfiguration: getSoraConfiguration,
  resolveVariant: resolveSoraVariant,
});
