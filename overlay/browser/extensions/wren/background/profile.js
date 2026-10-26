/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// A profile that was used before Wren (for example one picked in about:profiles) gets Wren's look the
// first time Wren opens it. Fresh profiles already have it, so for them this changes nothing.
browser.wren.adoptProfile().catch(() => {});
