/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Mods that come with Wren, so they can be added without the internet. They are ordinary mods: the same file format,
// and the same page shows what each one does before it is added. "sites" is style for web pages, not for the window.
const WREN_BUILTIN_MODS = [
  {
    format: 1,
    id: "wren-for-youtube",
    name: "wren for youtube",
    version: "1.0.0",
    author: "tuftle",
    description: "youtube in wren's colours: warm browns in the dark, cream in the light, softer corners and a serif face.",
    css: "",
    sites: [
      {
        matches: ["*://www.youtube.com/*", "*://m.youtube.com/*", "*://music.youtube.com/*"],
        css: `
/* dark: the browns of wren's own pages */
html[dark], [dark] {
  --yt-spec-base-background: #211c17 !important;
  --yt-spec-raised-background: #2a231c !important;
  --yt-spec-menu-background: #2a231c !important;
  --yt-spec-inverted-background: #f4efe6 !important;
  --yt-spec-general-background-a: #211c17 !important;
  --yt-spec-general-background-b: #2a231c !important;
  --yt-spec-general-background-c: #191510 !important;
  --yt-spec-text-primary: #e6dccd !important;
  --yt-spec-text-secondary: #9a8b7a !important;
  --yt-spec-text-disabled: #6b5d4f !important;
  --yt-spec-call-to-action: #d9a073 !important;
  --yt-spec-brand-link-text: #d9a073 !important;
  --yt-spec-themed-blue: #d9a073 !important;
  --yt-spec-badge-chip-background: #342b22 !important;
  --yt-spec-button-chip-background-hover: #3d3328 !important;
  --yt-spec-10-percent-layer: rgba(230, 220, 205, .10) !important;
  --yt-spec-5-percent-layer: rgba(230, 220, 205, .05) !important;
  --yt-spec-touch-response: rgba(230, 220, 205, .10) !important;
  --yt-spec-outline: rgba(230, 220, 205, .14) !important;
  --yt-spec-shadow: rgba(0, 0, 0, .35) !important;
  --yt-spec-snackbar-background: #342b22 !important;
}
/* light: cream */
html:not([dark]) {
  --yt-spec-base-background: #f4efe6 !important;
  --yt-spec-raised-background: #fbf8f2 !important;
  --yt-spec-menu-background: #fbf8f2 !important;
  --yt-spec-general-background-a: #f4efe6 !important;
  --yt-spec-general-background-b: #ebe3d4 !important;
  --yt-spec-general-background-c: #e6dccd !important;
  --yt-spec-text-primary: #3b2f25 !important;
  --yt-spec-text-secondary: #8a7b6b !important;
  --yt-spec-call-to-action: #8a4b2a !important;
  --yt-spec-brand-link-text: #8a4b2a !important;
  --yt-spec-themed-blue: #8a4b2a !important;
  --yt-spec-badge-chip-background: #e6dccd !important;
  --yt-spec-10-percent-layer: rgba(59, 47, 37, .10) !important;
  --yt-spec-5-percent-layer: rgba(59, 47, 37, .05) !important;
  --yt-spec-outline: rgba(59, 47, 37, .16) !important;
}
/* the page itself: youtube paints these from its own variables, so point them at the ones above */
html, body, ytd-app, #background, ytd-browse, ytd-two-column-browse-results-renderer,
ytd-watch-flexy, ytd-masthead, #masthead-container, #guide-content, ytd-mini-guide-renderer,
ytd-guide-renderer, tp-yt-app-drawer, ytd-search, ytd-page-manager {
  background-color: var(--yt-spec-base-background) !important;
}
ytd-masthead #background, ytd-masthead { background: var(--yt-spec-base-background) !important; }
ytd-guide-entry-renderer:hover, ytd-mini-guide-entry-renderer:hover { background-color: var(--yt-spec-10-percent-layer) !important; }
ytd-searchbox #search-form, #search-input, ytd-searchbox input {
  background-color: var(--yt-spec-raised-background) !important;
  color: var(--yt-spec-text-primary) !important;
}
/* a serif face, like the rest of wren, and rounder thumbnails */
ytd-app, ytd-app *, #masthead, #masthead * , yt-formatted-string, #video-title {
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif !important;
}
ytd-thumbnail a, ytd-thumbnail img, yt-image img, .yt-core-image {
  border-radius: 14px !important;
}
#search-input, ytd-searchbox #search-form, ytd-searchbox yt-icon-button, ytd-searchbox button {
  border-radius: 999px !important;
}
yt-chip-cloud-chip-renderer #chip-container, chip-shape button, .yt-spec-button-shape-next--size-m {
  border-radius: 999px !important;
}
/* the red logo becomes wren's brown */
ytd-topbar-logo-renderer yt-icon svg path:first-child { fill: #8a4b2a !important; }
`,
      },
    ],
  },
];
