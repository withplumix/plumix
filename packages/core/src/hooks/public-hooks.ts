// tsc drops augmentations from modules reached only through value or type
// imports; a side-effect import keeps each public hook's augmentation in the
// published declarations.
import "../route/render/render-template.js"; // render:document
import "../route/resolve.js"; // resolve:{single,archive,term,author,date,front-page,search}:data
import "../rpc/hooks.js"; // entry:*, term:*, user:*, settings:* lifecycle actions
import "./block-render.js"; // block:before_render, block:after_render, blocks:loader:error
