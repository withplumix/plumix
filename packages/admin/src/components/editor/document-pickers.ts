import type { MultiSelectOption } from "@/components/form/multi-select.js";

import type {
  AccessPolicyChoice,
  NamedTemplateChoice,
} from "@plumix/core/manifest";

export interface DocumentTemplatePicker {
  readonly value: string | null;
  readonly options: readonly NamedTemplateChoice[];
  readonly onChange: (next: string | null) => void;
}

export interface DocumentAccessPicker {
  readonly value: string | null;
  readonly options: readonly AccessPolicyChoice[];
  readonly onChange: (next: string | null) => void;
}

export interface DocumentTaxonomyPicker {
  readonly name: string;
  readonly label: string;
  readonly options: readonly MultiSelectOption[];
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}

interface DocumentPickers {
  readonly template?: DocumentTemplatePicker;
  readonly access?: DocumentAccessPicker;
  readonly taxonomies?: readonly DocumentTaxonomyPicker[];
}

/**
 * The pickers the document panel shows: a template or visibility picker only
 * when there is a choice to make, and one term picker per taxonomy.
 */
export function visibleDocumentPickers({
  template,
  access,
  taxonomies,
}: DocumentPickers): {
  readonly template: DocumentTemplatePicker | null;
  readonly access: DocumentAccessPicker | null;
  readonly taxonomies: readonly DocumentTaxonomyPicker[];
} {
  return {
    template: template && template.options.length > 0 ? template : null,
    access: access && access.options.length > 0 ? access : null,
    taxonomies: taxonomies ?? [],
  };
}
