import type { MessageDescriptor } from "plumix/i18n";

// Shared message descriptors for the media `media` field surfaces (picker
// button, empty state, modal). Kept in their own zero-runtime-dependency module
// so lightweight controls (the focal-point picker) can reuse a string without
// importing the whole MediaLibrary graph that MediaPickerField pulls in.
export const M = {
  empty: {
    id: "plugin.media.pickerField.empty",
    message: "No media selected",
  },
  buttonChange: {
    id: "plugin.media.pickerField.button.change",
    message: "Change",
  },
  buttonSelect: {
    id: "plugin.media.pickerField.button.select",
    message: "Select",
  },
  pending: {
    id: "plugin.media.pickerField.pending",
    message: "Selected (id {id})",
    comment: "id: the media item's numeric id, shown while filename loads",
  },
  modalAria: {
    id: "plugin.media.pickerField.modalAria",
    message: "Select media",
  },
} satisfies Record<string, MessageDescriptor>;
