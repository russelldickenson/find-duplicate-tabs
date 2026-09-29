const TRACKING_PARAMETER = /^(?:utm_[^=]+|gclid|dclid|fbclid|msclkid|mc_[^=]+|_hs[^=]*|ref)$/i;

const resultsElement = document.querySelector('#results');
const groupsElement = document.querySelector('#groups');
const emptyStateElement = document.querySelector('#empty-state');
const summaryElement = document.querySelector('#summary');
const statusElement = document.querySelector('#status');
const removeButton = document.querySelector('#remove-button');
const refreshButton = document.querySelector('#refresh-button');
const showSiteGroupsCheckbox = document.querySelector('#show-site-groups');
const siteGroupsElement = document.querySelector('#site-groups');

let duplicateGroups = [];
let siteGroups = [];
let showSiteGroups = false;
const MINIMUM_REFRESH_DURATION_MS = 1000;

function comparableUrl(tabUrl) {
  try {
    const url = new URL(tabUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return tabUrl;
  }
}

function findDuplicateGroups(tabs) {
  const byUrl = new Map();

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const key = comparableUrl(tab.url);
    const group = byUrl.get(key) ?? [];
    group.push(tab);
    byUrl.set(key, group);
  }

  return [...byUrl.entries()]
    .filter(([, tabsForUrl]) => tabsForUrl.length > 1)
    .map(([url, tabsForUrl]) => ({ url, tabs: tabsForUrl.sort((a, b) => a.index - b.index) }));
}

function siteKey(tabUrl) {
  try {
    const url = new URL(tabUrl);
    return /^https?:$/.test(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

function findSiteGroups(tabs) {
  const bySite = new Map();

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const key = siteKey(tab.url);
    if (!key) continue;
    const group = bySite.get(key) ?? [];
    group.push(tab);
    bySite.set(key, group);
  }

  return [...bySite.entries()]
    .filter(([, tabsForSite]) => tabsForSite.length > 1)
    .map(([site, tabsForSite]) => ({ site, tabs: tabsForSite.sort((a, b) => a.index - b.index) }))
    .sort((a, b) => a.site.localeCompare(b.site));
}

function makeTabItem(tab, shouldKeep) {
  const item = document.createElement('li');
  item.className = 'tab-item';

  if (tab.favIconUrl) {
    const icon = document.createElement('img');
    icon.src = tab.favIconUrl;
    icon.alt = '';
    icon.addEventListener('error', () => icon.remove());
    item.append(icon);
  }

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url;
  title.title = tab.url;
  item.append(title);

  const action = document.createElement('span');
  action.className = shouldKeep ? 'keep' : 'remove';
  action.textContent = shouldKeep ? 'Keep tab' : 'Delete tab';
  item.append(action);
  return item;
}

function render() {
  groupsElement.replaceChildren();
  siteGroupsElement.replaceChildren();
  const duplicateCount = duplicateGroups.reduce((count, group) => count + group.tabs.length - 1, 0);
  const groupCount = duplicateGroups.length;

  emptyStateElement.hidden = groupCount !== 0 || (showSiteGroups && siteGroups.length !== 0);
  groupsElement.hidden = groupCount === 0;
  siteGroupsElement.hidden = !showSiteGroups || siteGroups.length === 0;
  resultsElement.hidden = groupsElement.hidden && siteGroupsElement.hidden;
  removeButton.disabled = duplicateCount === 0;
  summaryElement.textContent = duplicateCount
    ? `${duplicateCount} tab${duplicateCount === 1 ? '' : 's'} can be closed across ${groupCount} duplicate set${groupCount === 1 ? '' : 's'}.`
    : showSiteGroups && siteGroups.length
      ? `No duplicate tabs. ${siteGroups.length} site${siteGroups.length === 1 ? '' : 's'} has multiple tabs.`
      : 'Everything is tidy in this window.';

  for (const group of duplicateGroups) {
    const section = document.createElement('article');
    section.className = 'group';
    const heading = document.createElement('div');
    heading.className = 'group-heading';
    const label = document.createElement('span');
    try {
      label.textContent = new URL(group.url).hostname || group.url;
    } catch {
      label.textContent = group.url;
    }
    const count = document.createElement('span');
    count.textContent = `${group.tabs.length} tabs`;
    heading.append(label, count);

    const tabList = document.createElement('ul');
    tabList.className = 'tab-list';
    group.tabs.forEach((tab, index) => tabList.append(makeTabItem(tab, index === 0)));
    section.append(heading, tabList);
    groupsElement.append(section);
  }

  for (const group of siteGroups) {
    const section = document.createElement('article');
    section.className = 'group';
    const heading = document.createElement('div');
    heading.className = 'group-heading';
    const label = document.createElement('span');
    label.textContent = group.site;
    const count = document.createElement('span');
    count.textContent = `${group.tabs.length} tabs`;
    heading.append(label, count);

    const tabList = document.createElement('ul');
    tabList.className = 'tab-list';
    group.tabs.forEach((tab) => tabList.append(makeTabItem(tab, false)));
    section.append(heading, tabList);
    siteGroupsElement.append(section);
  }
}

async function scan() {
  statusElement.textContent = '';
  summaryElement.textContent = 'Checking your tabs…';
  const tabs = await chrome.tabs.query({ currentWindow: true });
  duplicateGroups = findDuplicateGroups(tabs);
  siteGroups = findSiteGroups(tabs);
  render();
}

async function removeDuplicates() {
  const tabIds = duplicateGroups.flatMap((group) => group.tabs.slice(1).map((tab) => tab.id));
  if (!tabIds.length) return;
  const confirmed = window.confirm(`Close ${tabIds.length} duplicate tab${tabIds.length === 1 ? '' : 's'}? The first tab in each set will stay open.`);
  if (!confirmed) return;

  removeButton.disabled = true;
  try {
    await chrome.tabs.remove(tabIds);
    await scan();
    statusElement.textContent = `Closed ${tabIds.length} duplicate tab${tabIds.length === 1 ? '' : 's'}.`;
  } catch (error) {
    console.error('Could not close duplicate tabs', error);
    statusElement.textContent = 'Some tabs could not be closed. Refresh and try again.';
    removeButton.disabled = false;
  }
}

async function refresh() {
  if (refreshButton.disabled) return;

  const startedAt = Date.now();
  refreshButton.disabled = true;
  refreshButton.classList.add('is-loading');
  refreshButton.setAttribute('aria-busy', 'true');
  refreshButton.textContent = 'Refreshing';
  statusElement.textContent = 'Refreshing duplicate tabs…';

  try {
    await scan();
    const remainingDuration = MINIMUM_REFRESH_DURATION_MS - (Date.now() - startedAt);
    if (remainingDuration > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDuration));
    }
    statusElement.textContent = 'Results refreshed.';
  } catch (error) {
    console.error('Could not refresh duplicate tabs', error);
    statusElement.textContent = 'Could not refresh tabs. Please try again.';
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove('is-loading');
    refreshButton.removeAttribute('aria-busy');
    refreshButton.textContent = 'Refresh';
  }
}

refreshButton.addEventListener('click', () => {
  void refresh();
});
removeButton.addEventListener('click', () => {
  void removeDuplicates();
});
showSiteGroupsCheckbox.addEventListener('change', async () => {
  showSiteGroups = showSiteGroupsCheckbox.checked;
  await chrome.storage.sync.set({ showSiteGroups });
  render();
});

async function initialize() {
  const { showSiteGroups: savedShowSiteGroups = false } = await chrome.storage.sync.get('showSiteGroups');
  showSiteGroups = savedShowSiteGroups;
  showSiteGroupsCheckbox.checked = showSiteGroups;
  await scan();
}

void initialize();
