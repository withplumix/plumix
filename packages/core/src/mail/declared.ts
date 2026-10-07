import type { AnyPluginDescriptor } from "../config.js";
import type {
  AnyMailDefinition,
  MailOverride,
  MailOverrides,
} from "./contract/registry.js";
import { AppBootError } from "../runtime/contract/errors.js";
import { CORE_MAILS } from "./core-mails.js";

/** A declared mail as `ctx.mail.send` renders it. */
interface DeclaredMail {
  /** `core`, or the id of the plugin that declared it. */
  readonly owner: string;
  /** The declaration, with the site's and the theme's overrides applied. */
  readonly mail: AnyMailDefinition;
}

/** Every declared mail, by name. Built once at boot. */
export type DeclaredMails = ReadonlyMap<string, DeclaredMail>;

interface DeclareMailsInput {
  readonly plugins: readonly AnyPluginDescriptor[];
  /** The theme's `mail`. */
  readonly theme?: MailOverrides;
  /** The site's `mail.overrides`. */
  readonly site?: MailOverrides;
}

// Read by name rather than through the typed map: the names a site or theme
// overrides are checked against what was declared, not what was typed.
type OverridesByName = Readonly<
  Record<string, MailOverride<never> | undefined>
>;

/**
 * Core's mails and every plugin's `mails`, by name. Each of a mail's render
 * functions comes from the site's override, else the theme's, else the
 * declaring owner's. Throws `AppBootError` when two owners declare one name,
 * or the site or theme overrides a name nobody declared.
 */
export function declareMails(input: DeclareMailsInput): DeclaredMails {
  const owned: [string, AnyMailDefinition][] = [
    ...CORE_MAILS.map((mail): [string, AnyMailDefinition] => ["core", mail]),
    ...input.plugins.flatMap((plugin) =>
      (plugin.mails ?? []).map((mail): [string, AnyMailDefinition] => [
        plugin.id,
        mail,
      ]),
    ),
  ];
  const site: OverridesByName = input.site ?? {};
  const theme: OverridesByName = input.theme ?? {};
  const declared = new Map<string, DeclaredMail>();
  for (const [owner, mail] of owned) {
    const previous = declared.get(mail.name);
    if (previous !== undefined) {
      throw AppBootError.mailNameConflict({
        pluginId: owner,
        mail: mail.name,
        previousOwner: previous.owner,
      });
    }
    declared.set(mail.name, {
      owner,
      mail: applyOverrides(mail, site[mail.name], theme[mail.name]),
    });
  }
  assertDeclared("site", site, declared);
  assertDeclared("theme", theme, declared);
  return declared;
}

function assertDeclared(
  overriddenBy: "site" | "theme",
  overrides: OverridesByName,
  declared: DeclaredMails,
): void {
  for (const [name, override] of Object.entries(overrides)) {
    if (!declared.has(name)) {
      throw AppBootError.mailOverrideUndeclared({
        overriddenBy,
        mail: name,
        parts: Object.keys(override ?? {}),
      });
    }
  }
}

function applyOverrides(
  mail: AnyMailDefinition,
  site: MailOverride<never> | undefined,
  theme: MailOverride<never> | undefined,
): AnyMailDefinition {
  return {
    ...mail,
    subject: site?.subject ?? theme?.subject ?? mail.subject,
    text: site?.text ?? theme?.text ?? mail.text,
    html: site?.html ?? theme?.html ?? mail.html,
  };
}
