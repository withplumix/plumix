import { MediaLibrary } from "./MediaLibrary.js";
import { SiblingField } from "./SiblingField.js";

window.plumix?.registerPluginPage("/__runtime-proof", MediaLibrary);
window.plumix?.registerPluginFieldType("runtime-proof-sibling", SiblingField);
