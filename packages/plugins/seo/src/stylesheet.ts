/** Where the stylesheet answers, before any base prefix. */
export const SITEMAP_STYLESHEET_PATH = "/sitemap.xsl";

/** Fully inline, so rendering never depends on a second asset or route. */
export const SITEMAP_STYLESHEET = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>Sitemap</title>
        <meta name="robots" content="noindex"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          :root { color-scheme: light dark; }
          body {
            margin: 0 auto; padding: 2rem 1rem; max-width: 60rem;
            font: 16px/1.5 system-ui, sans-serif;
          }
          h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
          p { margin: 0 0 1.5rem; opacity: .7; }
          table { border-collapse: collapse; width: 100%; }
          th, td {
            text-align: left; padding: .5rem .75rem;
            border-bottom: 1px solid rgba(128,128,128,.3);
            font-size: .9rem; word-break: break-all;
          }
          th { font-weight: 600; white-space: nowrap; }
          td.meta { white-space: nowrap; opacity: .7; }
        </style>
      </head>
      <body>
        <h1>Sitemap</h1>
        <p>This is the XML a search engine reads, styled for people.</p>
        <table>
          <tr>
            <th>URL</th>
            <th>Last modified</th>
            <th>Images</th>
          </tr>
          <xsl:apply-templates select="s:sitemapindex/s:sitemap|s:urlset/s:url"/>
        </table>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="s:sitemap|s:url">
    <tr>
      <td>
        <a href="{s:loc}"><xsl:value-of select="s:loc"/></a>
      </td>
      <td class="meta"><xsl:value-of select="s:lastmod"/></td>
      <td class="meta">
        <xsl:if test="image:image"><xsl:value-of select="count(image:image)"/></xsl:if>
      </td>
    </tr>
  </xsl:template>
</xsl:stylesheet>
`;
