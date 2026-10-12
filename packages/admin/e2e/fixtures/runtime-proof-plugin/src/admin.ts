// Fixture plugin's adminEntry — what `plumix.config.ts` would point at
// in a real plugin's package. Registers the page component and a field type
// into `window.plumix`, exactly the same calls any plugin author would make.

import { MediaLibrary } from "./MediaLibrary.js";
import { SiblingField } from "./SiblingField.js";

window.plumix?.registerPluginPage("/__runtime-proof", MediaLibrary);
window.plumix?.registerPluginFieldType("runtime-proof-sibling", SiblingField);
