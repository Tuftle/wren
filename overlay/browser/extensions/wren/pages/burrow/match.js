// Which saved logins belong to a page. Strict on purpose: a page only ever gets logins for its own site.

function hostOnly(h) {
  return h.toLowerCase().replace(/^www\./, "");
}

// The site an entry belongs to: its web address if it has one, else its name when that looks like a host.
export function entryHost(e) {
  const raw = String(e.url || e.site || "").trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try { return hostOnly(new URL(raw).hostname); } catch { return ""; }
  }
  const s = hostOnly(raw.split("/")[0]);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : "";
}

// Fill only over https (or a local test page), and only for the entry's own host or a subdomain of it.
export function matches(entry, pageUrl) {
  let u;
  try { u = new URL(pageUrl); } catch { return false; }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!(u.protocol === "https:" || (u.protocol === "http:" && local))) return false;
  const want = entryHost(entry);
  if (!want) return false;
  const page = hostOnly(u.hostname);
  return page === want || page.endsWith("." + want);
}
