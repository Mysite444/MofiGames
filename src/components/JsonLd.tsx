/** Renders one JSON-LD structured-data block. Accepts either a single
 * schema object or an array (rendered as separate <script> tags) — pages
 * that emit several schemas (e.g. a game page's VideoGame + breadcrumb)
 * just pass an array instead of nesting components. `@graph` is
 * deliberately avoided: separate <script> tags validate more predictably
 * across Google's Rich Results Test and Schema.org's own validator. */
export function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        // eslint-disable-next-line react/no-danger
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify of server-generated, non-user-editable schema
          // objects — safe from the injection risk this rule normally
          // guards against (no raw HTML/user input is ever rendered here).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
