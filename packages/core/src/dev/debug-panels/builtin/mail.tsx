import type { CaughtMail } from "../../../context/dev-runtime.js";
import type { DebugSnapshot } from "../../request-history/snapshot.js";
import type { DebugPanel } from "../types.js";
import { isJsonObject } from "../../../json.js";
import { DEBUG_MAIL_PANEL_ID } from "../../mail/path.js";
import { MailView } from "../../mail/viewer.js";

/** What `ctx.mail` recorded for one sent mail; a caught mail less its id. */
type RecordedMail = Omit<CaughtMail, "id" | "at">;

/** The Mail panel: each mail the request sent, rendered as it went out. */
export const mailPanel: DebugPanel = {
  id: DEBUG_MAIL_PANEL_ID,
  title: "Mail",
  order: 30,
  render: ({ records }: DebugSnapshot) => {
    const mails = (records[DEBUG_MAIL_PANEL_ID] ?? []).flatMap((record) =>
      // Safety: only the dev mail wiring records under this namespace, and it
      // writes a `RecordedMail`.
      isJsonObject(record.data) ? [record.data as unknown as RecordedMail] : [],
    );
    if (mails.length === 0) {
      return (
        <p className="plumix-debug-bar__empty">No mail sent on this request.</p>
      );
    }
    return mails.map((mail, index) => (
      <section key={index}>
        <details className="plumix-debug-bar__mail">
          <summary>
            <span className="plumix-debug-bar__mail-name">{mail.name}</span>
            {` → ${mail.to} · ${mail.subject}`}
          </summary>
          <MailView
            id={`request-${index}`}
            subject={mail.subject}
            text={mail.text}
            html={mail.html}
          />
        </details>
      </section>
    ));
  },
};
