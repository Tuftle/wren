// small drawn marks for the common engines, used when Firefox has no icon for one yet (offline, first run)
const WrenEngineIcons = (() => {
  const svg = body => "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + body + "</svg>");
  const marks = {
    nook: svg('<rect width="48" height="48" rx="12" fill="#8a4b2d"/><path d="M12 36V14h5l14 15V14h5v22h-5L17 21v15z" fill="#f6ead6"/>'),
    google: svg('<rect width="48" height="48" rx="12" fill="#fff"/><path d="M38 24.4c0-.9-.1-1.6-.2-2.4H24v4.6h7.9a6.8 6.8 0 0 1-2.9 4.4v3.7h4.7c2.8-2.5 4.3-6.300 4.3-10.300z" fill="#4285f4"/><path d="M24 39c4 0 7.300-1.300 9.700-3.600L29 31.700c-1.300.9-3 1.400-5 1.400-3.800 0-7.100-2.600-8.200-6.100H11v3.800A14.600 14.600 0 0 0 24 39z" fill="#34a853"/><path d="M15.800 27c-.3-.9-.5-1.800-.5-2.800s.2-1.900.5-2.800v-3.800H11a14.600 14.600 0 0 0 0 13.200z" fill="#fbbc05"/><path d="M24 15.400c2.200 0 4.100.8 5.700 2.200l4.200-4.200A14.600 14.600 0 0 0 11 18.600l4.800 3.800c1.100-3.500 4.400-7 8.200-7z" fill="#ea4335"/>'),
    bing: svg('<rect width="48" height="48" rx="12" fill="#0f6e7a"/><path d="M16 10l7 2.500v16.500l8.500-4.800-4.500-2.200-2.700-6.800L37 21.200v7.600L23 38l-7-3.800z" fill="#fff"/>'),
    duckduckgo: svg('<rect width="48" height="48" rx="12" fill="#de5833"/><circle cx="24" cy="24" r="13" fill="#fff"/><circle cx="24" cy="24" r="10" fill="#de5833"/><ellipse cx="21" cy="21" rx="3" ry="3.500" fill="#fff"/><circle cx="21.700" cy="21" r="1.300" fill="#2d2d2d"/><path d="M26 27c2 1 4 .5 5-1" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'),
    ecosia: svg('<rect width="48" height="48" rx="12" fill="#2f7d4f"/><path d="M24 11c-8 2-12 9-10 16 1 4 5 7 10 7s9-3 10-7c2-7-2-14-10-16z" fill="#bfe3a8"/><path d="M24 15v21M24 25l-5-4M24 29l5-4" stroke="#2f7d4f" stroke-width="2.200" stroke-linecap="round"/>'),
    startpage: svg('<rect width="48" height="48" rx="12" fill="#4b52d6"/><path d="M13 31l11-18 11 18-11-5z" fill="#fff"/>'),
  };
  return name => {
    const key = String(name).toLowerCase().replace(/[^a-z]/g, "");
    return marks[key] || "";
  };
})();
