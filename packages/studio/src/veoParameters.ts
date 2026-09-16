import { getVeoConfiguration, resolveVeoVariant } from "./veoModels";
import { createNativeVideoParameters } from "./nativeVideoParameters";

export const {
  plan: planVeoSelection,
  resolutions: getVeoResolutionOptions,
  adjustments: getVeoSelectionAdjustments,
} = createNativeVideoParameters({ getConfiguration: getVeoConfiguration, resolveVariant: resolveVeoVariant });
