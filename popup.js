const TRACKING_PARAMETER = /^(?:utm_[^=]+|gclid|dclid|fbclid|msclkid|mc_[^=]+|_hs[^=]*|ref)$/i;

const resultsElement = document.querySelector('#results');
const groupsElement = document.querySelector('#groups');
const emptyStateElement = document.querySelector('#empty-state');
const summaryElement = document.querySelector('#summary');
const statusElement = document.querySelector('#status');
const removeButton = document.querySelector('#remove-button');
const refreshButton = document.querySelector('#refresh-button');
const showSimilarCheckbox = document.querySelector('#show-similar');
const similarGroupsElement = document.querySelector('#similar-groups');

let duplicateGroups = [];
let similarGroups = [];
let showSimilar = false;
const MINIMUM_REFRESH_DURATION_MS = 1000;

function normalizedUrl(tabUrl) {
  try {
    const url = new URL(tabUrl);
    url.hash = '';
    if (/^https?:$/.test(url.protocol)) {
      url.protocol = 'https:';
      url.port = '';
      url.hostname = url.hostname.replace(/^www\./, '');
      url.pathname = url.pathname.replace(/\/index\.html?$/i, '/').replace(/(.)\/+$/, '$1');
    }
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url;
  } catch {
    return null;
  }
}

function comparableUrl(tabUrl) {
  return normalizedUrl(tabUrl)?.href ?? tabUrl;
}

// Same site and path, ignoring the query string. Null for non-web pages and site roots.
function pageKey(tabUrl) {
  const url = normalizedUrl(tabUrl);
  if (!url || url.protocol !== 'https:' || url.pathname === '/') return null;
  return url.hostname + url.pathname;
}

function titleKey(title) {
  const key = (title ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return key && key !== 'new tab' ? key : null;
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

function groupBy(tabs, keyOf) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = keyOf(tab);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(tab);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function findSimilarGroups(tabs) {
  // One tab per exact URL: exact duplicates are already reported above.
  const uniqueTabs = [...new Map(tabs.filter((tab) => tab.id && tab.url).map((tab) => [comparableUrl(tab.url), tab])).values()];
  const groups = [];
  const seen = new Set();
  const add = (reason, tabsForGroup) => {
    const sorted = tabsForGroup.sort((a, b) => a.index - b.index);
    const signature = sorted.map((tab) => tab.id).join();
    if (seen.has(signature)) return;
    seen.add(signature);
    groups.push({ reason, tabs: sorted });
  };

  for (const group of groupBy(uniqueTabs, (tab) => titleKey(tab.title))) add('Same title', group);
  for (const group of groupBy(uniqueTabs, (tab) => pageKey(tab.url))) add('Same page, different query', group);
  return groups;
}

function makeFavicon(tab) {
  if (!tab.favIconUrl) return null;
  const icon = document.createElement('img');
  icon.src = tab.favIconUrl;
  icon.alt = '';
  icon.addEventListener('error', () => icon.remove());
  return icon;
}

function displayUrl(tab) {
  return tab.url.replace(/#.*$/, '');
}

function commonPrefixLength(urls) {
  const [first, ...rest] = urls;
  let length = first.length;
  for (const url of rest) {
    let i = 0;
    while (i < length && url[i] === first[i]) i++;
    length = i;
  }
  // Back up to a URL boundary so the highlighted part starts on a whole segment.
  const boundary = Math.max(...['/', '?', '&', '='].map((char) => first.lastIndexOf(char, length - 1)));
  return boundary + 1;
}

function makeUrlLine(url, prefixLength) {
  const line = document.createElement('span');
  line.className = 'dup-url';
  const prefix = url.slice(0, prefixLength).replace(/^https?:\/\//, '');
  const rest = url.slice(prefixLength);
  line.append(prefix.length > 24 ? `…${prefix.slice(-24)}` : prefix);
  if (rest) {
    const diff = document.createElement('mark');
    diff.textContent = rest;
    line.append(diff);
  }
  return line;
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function closeTab(tab) {
  await chrome.tabs.remove(tab.id);
  await scan();
}

function makeSimilarTabItem(tab, prefixLength) {
  const item = document.createElement('li');
  item.className = 'tab-item';
  item.title = tab.url;

  const icon = makeFavicon(tab);
  if (icon) item.append(icon);

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'tab-link';
  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url;
  link.append(title, makeUrlLine(displayUrl(tab), prefixLength));
  link.addEventListener('click', () => void focusTab(tab));

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tab-close';
  close.textContent = '×';
  close.title = 'Close this tab';
  close.setAttribute('aria-label', `Close tab: ${tab.title || tab.url}`);
  close.addEventListener('click', () => void closeTab(tab));

  item.append(link, close);
  return item;
}

function makeDuplicateGroupItem(group) {
  const [first] = group.tabs;
  const section = document.createElement('article');
  section.className = 'group dup-row';
  section.title = first.url;

  const icon = makeFavicon(first);
  if (icon) section.append(icon);

  const text = document.createElement('div');
  text.className = 'dup-text';
  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = first.title || first.url;
  const url = document.createElement('span');
  url.className = 'dup-url';
  url.textContent = displayUrl(first);
  text.append(title, url);

  const count = document.createElement('div');
  count.className = 'dup-count';
  const badge = document.createElement('strong');
  badge.textContent = `×${group.tabs.length}`;
  const closing = document.createElement('small');
  closing.textContent = `close ${group.tabs.length - 1}`;
  count.append(badge, closing);

  section.append(text, count);
  return section;
}

function render() {
  groupsElement.replaceChildren();
  similarGroupsElement.replaceChildren();
  const duplicateCount = duplicateGroups.reduce((count, group) => count + group.tabs.length - 1, 0);
  const groupCount = duplicateGroups.length;

  emptyStateElement.hidden = groupCount !== 0 || (showSimilar && similarGroups.length !== 0);
  groupsElement.hidden = groupCount === 0;
  similarGroupsElement.hidden = !showSimilar || similarGroups.length === 0;
  resultsElement.hidden = groupsElement.hidden && similarGroupsElement.hidden;
  removeButton.disabled = duplicateCount === 0;
  summaryElement.textContent = duplicateCount
    ? `${duplicateCount} tab${duplicateCount === 1 ? '' : 's'} can be closed across ${groupCount} duplicate set${groupCount === 1 ? '' : 's'}.`
    : showSimilar && similarGroups.length
      ? `No exact duplicates. ${similarGroups.length} possible duplicate set${similarGroups.length === 1 ? '' : 's'} to review.`
      : 'Everything is tidy in this window.';

  for (const group of duplicateGroups) groupsElement.append(makeDuplicateGroupItem(group));

  for (const group of similarGroups) {
    const section = document.createElement('article');
    section.className = 'group';
    const heading = document.createElement('div');
    heading.className = 'group-heading';
    const reason = document.createElement('span');
    reason.textContent = group.reason;
    const count = document.createElement('span');
    count.textContent = `${group.tabs.length} tabs`;
    heading.append(reason, count);

    const prefixLength = commonPrefixLength(group.tabs.map(displayUrl));
    const tabList = document.createElement('ul');
    tabList.className = 'tab-list';
    group.tabs.forEach((tab) => tabList.append(makeSimilarTabItem(tab, prefixLength)));
    section.append(heading, tabList);
    similarGroupsElement.append(section);
  }
}

async function scan() {
  statusElement.textContent = '';
  summaryElement.textContent = 'Checking your tabs…';
  const tabs = await chrome.tabs.query({ currentWindow: true });
  duplicateGroups = findDuplicateGroups(tabs);
  similarGroups = findSimilarGroups(tabs);
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
showSimilarCheckbox.addEventListener('change', async () => {
  showSimilar = showSimilarCheckbox.checked;
  await chrome.storage.sync.set({ showSiteGroups: showSimilar });
  render();
});

async function initialize() {
  const { showSiteGroups: savedShowSimilar = false } = await chrome.storage.sync.get('showSiteGroups');
  showSimilar = savedShowSimilar;
  showSimilarCheckbox.checked = showSimilar;
  await scan();
}

void initialize();
