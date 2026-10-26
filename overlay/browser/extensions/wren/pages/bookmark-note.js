/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const id = new URLSearchParams(location.search).get("id");
const note = document.getElementById("note");

browser.bookmarks.get(id).then(([b]) => {
  document.getElementById("what").textContent = b?.title || b?.url || "";
});

async function save() {
  if (note.value.trim()) {
    const { bookmarkNotes = {} } = await browser.storage.local.get("bookmarkNotes");
    bookmarkNotes[id] = note.value.trim();
    await browser.storage.local.set({ bookmarkNotes });
    // the note is kept in the bookmark's own title line too, so it shows in the bookmarks list
    const [b] = await browser.bookmarks.get(id);
    if (b && !b.title.includes(" — ")) {
      await browser.bookmarks.update(id, { title: b.title + " — " + note.value.trim() });
    }
  }
  window.close();
}
document.getElementById("save").addEventListener("click", save);
document.getElementById("skip").addEventListener("click", () => window.close());
note.addEventListener("keydown", e => {
  if (e.key == "Enter") {
    save();
  } else if (e.key == "Escape") {
    window.close();
  }
});
