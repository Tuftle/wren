/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Wren's own defaults. Everything here is a plain preference, so a person can still change any
// of it in Settings or about:config. Keep this the one place Wren's choices live: it makes
// pulling in Mozilla's updates easy, because firefox.js itself is left alone.

// --- starting up: Wren has its own welcome tour (the "wren" built-in extension)
// the start page is provided by the built-in wren extension, which keeps one fixed internal address
pref("extensions.webextensions.uuids", "{\"wren@wren.local\":\"606acf45-4e5f-4a53-8338-ff2c61453a61\"}");
pref("browser.startup.homepage", "moz-extension://606acf45-4e5f-4a53-8338-ff2c61453a61/pages/start.html");
pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_welcome_url.additional", "");
pref("browser.aboutwelcome.enabled", false);
pref("browser.startup.homepage_override.mstone", "ignore");

// --- updates: Wren is not on Mozilla's update servers, so nothing is asked of them
pref("app.update.auto", false);
pref("app.update.interval", 86400);
pref("app.update.promptWaitTime", 86400);
pref("app.update.url.manual", "https://nooksearch.vercel.app");
pref("app.update.url.details", "https://nooksearch.vercel.app");
pref("app.update.checkInstallTime.days", 2);
pref("app.update.badgeWaitTime", 0);

// --- nothing is sent home: no telemetry, studies, experiments, sponsored anything
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("app.shield.optoutstudies.enabled", false);
pref("app.normandy.enabled", false);
pref("messaging-system.rsexperimentloader.enabled", false);
pref("browser.discovery.enabled", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.urlbar.quicksuggest.enabled", false);
pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
pref("browser.newtabpage.activity-stream.telemetry", false);
pref("extensions.pocket.enabled", false);
pref("browser.vpn_promo.enabled", false);
pref("browser.promo.focus.enabled", false);
pref("browser.promo.pin.enabled", false);
pref("browser.preferences.moreFromMozilla", false);

// --- privacy that does not break sites
pref("privacy.globalprivacycontrol.enabled", true);
pref("privacy.globalprivacycontrol.functionality.enabled", true);
pref("dom.security.https_first", true);
pref("dom.security.https_first_pbm", true);

// Number of usages of the web console.
// If this is less than 5, then pasting code into the web console is disabled
pref("devtools.selfxss.count", 5);

// --- websites: always include the "Firefox/x.y" token, even in builds that name the app something else
pref("general.useragent.compatMode.firefox", true);

// --- look: the Wren theme (cream and brown, follows the system's light/dark setting)
pref("extensions.activeThemeID", "wren-theme@wren.local");

// --- search: nook, at nooksearch.vercel.app unless you host your own copy
pref("wren.search.baseUrl", "https://nooksearch.vercel.app");

// --- Firefox's own new-tab page (only seen if the wren one cannot load): no sponsored tiles or stories
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.newtabpage.activity-stream.feeds.system.topstories", false);
pref("browser.newtabpage.activity-stream.system.showSponsored", false);
pref("browser.newtabpage.activity-stream.system.showWeather", false);

// --- importing from the welcome opens the import window on its own, not a settings tab
pref("browser.migrate.content-modal.about-welcome-behavior", "standalone");

// --- a quiet, minimal browser: fewer bars, buttons and promos
pref("browser.toolbars.bookmarks.visibility", "never");
pref("sidebar.verticalTabs", true);
pref("sidebar.verticalTabs.dragToPinPromo.dismissed", true);
pref("browser.uidensity", 1);
pref("browser.urlbar.suggest.trending", false);
pref("browser.urlbar.suggest.engines", false);
pref("browser.urlbar.shortcuts.bookmarks", false);
pref("browser.urlbar.shortcuts.tabs", false);
pref("browser.urlbar.shortcuts.history", false);
pref("browser.urlbar.suggest.recentsearches", true);
pref("browser.urlbar.suggest.calculator", true);
pref("browser.urlbar.unitConversion.enabled", true);

// no Mozilla account, AI helpers or add-on recommendations
pref("identity.fxaccounts.enabled", false);
pref("browser.ml.chat.enabled", false);
pref("browser.ml.chat.shortcuts", false);
pref("browser.ml.linkPreview.enabled", false);
pref("browser.tabs.groups.smart.enabled", false);
pref("browser.smartwindow.enabled", false);
pref("extensions.getAddons.showPane", false);
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
pref("browser.shell.checkDefaultBrowser", false);
pref("sidebar.main.tools", "history,bookmarks");

// settings: no "Labs" and no AI pages
pref("browser.preferences.experimental.hidden", true);
pref("browser.preferences.aiControls", false);

// rooms (Firefox containers) are on, and translations run on this computer
pref("privacy.userContext.enabled", true);
pref("privacy.userContext.ui.enabled", true);

// no VPN button or promo: Wren does not sell one
pref("browser.ipProtection.enabled", false);
pref("browser.ipProtection.blockIPProtectionCallouts", true);
