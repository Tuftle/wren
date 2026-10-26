/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Wren's own search engine: nook.
 *
 * Mozilla's search configuration comes from Remote Settings and can change at
 * any time. This file is the one place where Wren adds nook to that
 * configuration and makes it the default, so a sync can never remove it.
 * SearchEngineSelector.sys.mjs calls withWrenEngine() on every configuration
 * it hands to the selector.
 *
 * Where nook lives is the preference "wren.search.baseUrl", so a person who
 * hosts their own copy only changes that one setting.
 */

const ENGINE_ID = "nook";
const DEFAULT_BASE = "https://nooksearch.vercel.app";

function baseUrl() {
  let base = Services.prefs.getStringPref("wren.search.baseUrl", DEFAULT_BASE);
  return base.replace(/\/+$/, "") || DEFAULT_BASE;
}

function nookRecord() {
  let base = baseUrl();
  return {
    id: "6e6f6f6b-0000-4000-8000-686561727468",
    recordType: "engine",
    identifier: ENGINE_ID,
    schema: 1,
    last_modified: 1,
    base: {
      name: "nook",
      aliases: ["nook", "n"],
      classification: "general",
      urls: {
        search: {
          base: base + "/search",
          searchTermParamName: "q",
        },
        suggestions: {
          base: base + "/suggest",
          params: [{ name: "type", value: "list" }],
          searchTermParamName: "q",
        },
      },
    },
    variants: [{ environment: { allRegionsAndLocales: true } }],
  };
}

/**
 * @param {object[]} records
 *   The search configuration records.
 * @returns {object[]}
 *   A copy of the records with nook added and set as the default engine.
 */
export function withWrenEngine(records) {
  let out = [];
  for (let record of records) {
    if (record.recordType == "engine" && record.identifier == ENGINE_ID) {
      continue;
    }
    if (record.recordType == "defaultEngines") {
      // One default for everyone, whatever their region or language.
      record = { ...record, globalDefault: ENGINE_ID, specificDefaults: [] };
    }
    out.push(record);
  }
  out.push(nookRecord());
  return out;
}
