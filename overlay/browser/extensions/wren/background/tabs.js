/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Everything about tabs: sleeping tabs, grouping by site, workspaces, tab names, reminders,
// sessions, sound, and the (opt-in) time report. All of it is stored in this browser only.

// --- sleeping tabs ------------------------------------------------------------------------------
async function sleepIdleTabs(force = false) {
  const settings = await WrenSettings.get();
  if (!settings.sleepTabs && !force) {
    return 0;
  }
  const limit = Date.now() - (force ? 0 : settings.sleepMinutes * 60000);
  const tabs = await browser.tabs.query({ active: false, audible: false, pinned: false, discarded: false });
  const sleepy = tabs.filter(t => /^https?:/.test(t.url) && (t.lastAccessed || 0) < limit);
  if (sleepy.length) {
    await browser.tabs.discard(sleepy.map(t => t.id));
  }
  return sleepy.length;
}

// --- group tabs by site -----------------------------------------------------------------------------
const GROUP_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

async function groupBySite() {
  const tabs = await browser.tabs.query({ currentWindow: true, pinned: false });
  const byHost = new Map();
  for (const t of tabs) {
    const host = wrenHost(t.url);
    if (host && /^https?:/.test(t.url)) {
      byHost.set(host, [...(byHost.get(host) || []), t.id]);
    }
  }
  let n = 0;
  for (const [host, ids] of byHost) {
    if (ids.length < 2) {
      continue;
    }
    try {
      const groupId = await browser.tabs.group({ tabIds: ids });
      await browser.tabGroups.update(groupId, { title: host, color: GROUP_COLORS[n % GROUP_COLORS.length] });
      n++;
    } catch (e) {
      // this Firefox may not have tab groups available
    }
  }
  return n;
}

// --- workspaces: named sets of tabs, the others are hidden -----------------------------------------
async function wsState() {
  const { workspaces = { current: "main", names: ["main"] } } = await browser.storage.local.get("workspaces");
  return workspaces;
}

async function tabWorkspace(tab, state) {
  return (await browser.sessions.getTabValue(tab.id, "ws").catch(() => null)) || (state ? state.current : "main");
}

browser.tabs.onCreated.addListener(async tab => {
  const state = await wsState();
  if (state.names.length > 1) {
    browser.sessions.setTabValue(tab.id, "ws", state.current).catch(() => {});
  }
});

async function switchWorkspace(name) {
  const state = await wsState();
  if (!state.names.includes(name)) {
    return state;
  }
  state.current = name;
  await browser.storage.local.set({ workspaces: state });
  const tabs = await browser.tabs.query({ currentWindow: true });
  const show = [];
  const hide = [];
  for (const t of tabs) {
    (await tabWorkspace(t, { current: "main" })) == name ? show.push(t.id) : hide.push(t.id);
  }
  if (show.length) {
    await browser.tabs.show(show);
  } else {
    const fresh = await browser.tabs.create({ active: true });
    await browser.sessions.setTabValue(fresh.id, "ws", name);
    show.push(fresh.id);
  }
  const active = tabs.find(t => t.active);
  if (active && hide.includes(active.id)) {
    await browser.tabs.update(show[0], { active: true });
  }
  if (hide.length) {
    await browser.tabs.hide(hide);
  }
  return state;
}

async function addWorkspace(name) {
  const state = await wsState();
  name = name.trim().slice(0, 24);
  if (name && !state.names.includes(name)) {
    state.names.push(name);
    await browser.storage.local.set({ workspaces: state });
    // tabs that exist now belong to the workspace you were in
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
      if (!(await browser.sessions.getTabValue(t.id, "ws").catch(() => null))) {
        await browser.sessions.setTabValue(t.id, "ws", state.current);
      }
    }
  }
  return state;
}

async function deleteWorkspace(name) {
  const state = await wsState();
  if (name == "main") {
    return state;
  }
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    if ((await browser.sessions.getTabValue(t.id, "ws").catch(() => null)) == name) {
      await browser.sessions.setTabValue(t.id, "ws", "main");
    }
  }
  state.names = state.names.filter(n => n != name);
  state.current = state.current == name ? "main" : state.current;
  await browser.storage.local.set({ workspaces: state });
  return switchWorkspace(state.current);
}

// --- tab names ---------------------------------------------------------------------------------------
const tabNames = new Map();

async function renameTab(tab) {
  const [title] = await browser.tabs.executeScript(tab.id, {
    code: 'prompt("what should this tab be called? (leave empty to go back to the page\'s own title)", document.title)',
  });
  if (title === null || title === undefined) {
    return;
  }
  if (title.trim()) {
    tabNames.set(tab.id, title.trim());
  } else {
    tabNames.delete(tab.id);
  }
  browser.tabs.sendMessage(tab.id, { type: "renameTab", title: title.trim() });
}

browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status == "complete" && tabNames.has(tabId)) {
    browser.tabs.sendMessage(tabId, { type: "renameTab", title: tabNames.get(tabId) }).catch(() => {});
  }
});
browser.tabs.onRemoved.addListener(tabId => tabNames.delete(tabId));

// --- remind me ---------------------------------------------------------------------------------------
async function remind(tab, minutes) {
  const { reminders = [] } = await browser.storage.local.get("reminders");
  const item = { id: Date.now().toString(36), url: tab.url, title: tab.title, due: Date.now() + minutes * 60000 };
  reminders.push(item);
  await browser.storage.local.set({ reminders });
  browser.alarms.create("remind-" + item.id, { when: item.due });
  if (tab.id) {
    browser.tabs.remove(tab.id);
  }
  return item;
}

async function fireReminder(id) {
  const { reminders = [] } = await browser.storage.local.get("reminders");
  const item = reminders.find(r => r.id == id);
  if (!item) {
    return;
  }
  await browser.storage.local.set({ reminders: reminders.filter(r => r.id != id) });
  browser.tabs.create({ url: item.url, active: false });
  browser.notifications.create("remind-" + id, {
    type: "basic",
    iconUrl: browser.runtime.getURL("pages/bird.svg"),
    title: "you asked to be reminded",
    message: item.title || item.url,
  });
}

async function restoreReminders() {
  const { reminders = [] } = await browser.storage.local.get("reminders");
  for (const r of reminders) {
    if (r.due <= Date.now()) {
      fireReminder(r.id);
    } else {
      browser.alarms.create("remind-" + r.id, { when: r.due });
    }
  }
}

// --- sessions: all windows and tabs, saved under a name ---------------------------------------------
async function saveSession(name) {
  const windows = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const data = windows.map(w => w.tabs
    .filter(t => /^https?:/.test(t.url))
    .map(t => ({ url: t.url, title: t.title, pinned: t.pinned })));
  const { sessions = {} } = await browser.storage.local.get("sessions");
  sessions[name.trim().slice(0, 40) || "session " + wrenDay()] = { saved: Date.now(), windows: data.filter(w => w.length) };
  await browser.storage.local.set({ sessions });
  return Object.keys(sessions);
}

async function restoreSession(name) {
  const { sessions = {} } = await browser.storage.local.get("sessions");
  const s = sessions[name];
  if (!s) {
    return false;
  }
  for (const tabs of s.windows) {
    await browser.windows.create({ url: tabs.map(t => t.url) });
  }
  return true;
}

// --- sound ---------------------------------------------------------------------------------------------
async function muteAll(mute) {
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    if (mute ? t.audible : t.mutedInfo?.muted) {
      await browser.tabs.update(t.id, { muted: mute });
    }
  }
}

// --- the time report (opt in): seconds per site per day -----------------------------------------------
setInterval(async () => {
  const settings = await WrenSettings.get();
  if (!settings.timeReport) {
    return;
  }
  const win = await browser.windows.getLastFocused({ populate: true }).catch(() => null);
  if (!win || !win.focused) {
    return;
  }
  const tab = win.tabs.find(t => t.active);
  const host = tab && /^https?:/.test(tab.url) ? wrenHost(tab.url) : "";
  if (!host) {
    return;
  }
  const { timeLog = {} } = await browser.storage.local.get("timeLog");
  const day = (timeLog[wrenDay()] ||= {});
  day[host] = (day[host] || 0) + 10;
  for (const d of Object.keys(timeLog)) {
    if (Date.now() - new Date(d).getTime() > 90 * 86400000) {
      delete timeLog[d];
    }
  }
  browser.storage.local.set({ timeLog });
}, 10000);

// --- alarms and messages -----------------------------------------------------------------------------
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == "sleep") {
    sleepIdleTabs();
  } else if (alarm.name.startsWith("remind-")) {
    fireReminder(alarm.name.slice(7));
  }
});
browser.alarms.create("sleep", { delayInMinutes: 5, periodInMinutes: 5 });
restoreReminders();

browser.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case "sleepNow":
      return sleepIdleTabs(true);
    case "groupBySite":
      return groupBySite();
    case "ws":
      if (message.action == "list") {
        return wsState();
      }
      if (message.action == "add") {
        return addWorkspace(message.name);
      }
      if (message.action == "switch") {
        return switchWorkspace(message.name);
      }
      if (message.action == "delete") {
        return deleteWorkspace(message.name);
      }
      return undefined;
    case "remind":
      return browser.tabs.get(message.tabId).then(tab => remind(tab, message.minutes));
    case "session":
      if (message.action == "save") {
        return saveSession(message.name);
      }
      if (message.action == "restore") {
        return restoreSession(message.name);
      }
      if (message.action == "delete") {
        return browser.storage.local.get("sessions").then(async ({ sessions = {} }) => {
          delete sessions[message.name];
          await browser.storage.local.set({ sessions });
          return Object.keys(sessions);
        });
      }
      return undefined;
    case "muteAll":
      return muteAll(message.mute);
    case "openTab":
      return browser.tabs.create({ url: message.url, active: false });
    default:
      return undefined;
  }
});

browser.contextMenus.create({ id: "rename-tab", title: "rename this tab", contexts: ["page"] });
browser.contextMenus.create({ id: "highlight", title: "highlight this text", contexts: ["selection"] });
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId == "rename-tab") {
    renameTab(tab);
  } else if (info.menuItemId == "highlight") {
    browser.tabs.sendMessage(tab.id, { type: "highlightSelection" });
  }
});
