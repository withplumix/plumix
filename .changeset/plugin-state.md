---
"plumix": minor
---

Adds `state` to plugin descriptors: a factory core calls once per install, whose result reaches the plugin's `provides`, `setup` and `afterSetup` as their second argument, typed from what it returns. Breaking: `PluginDescriptor`, `PluginSetup` and `DefinePluginInput` take the state type in place of the unused `TConfig` parameter, and `PluginProvides` and `PluginAfterSetup` gain it. A bare `PluginDescriptor` now means a descriptor without state, so type a list of mixed descriptors as `AnyPluginDescriptor[]`.
