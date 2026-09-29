<div align="center">

<img src="assets/icons/icon-128.png" alt="Duplicate Tab Finder icon: two overlapping tabs with the duplicate badged for removal" width="96" height="96" />

# Duplicate Tab Finder

**Find duplicate tabs in your current Chrome window and close the extras in one click.**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)
![Privacy](https://img.shields.io/badge/Data-stays%20in%20your%20browser-277356?style=flat-square)

</div>

<div align="center">

<img src="assets/screenshot.png" alt="Duplicate Tab Finder popup listing two duplicate sets with Keep tab and Delete tab labels" width="340" />

</div>

---

## Purpose

A busy browsing session collects the same page over and over. Duplicate Tab Finder shows you which tabs in the current window point at the same page, then closes the extras. The first tab in each set always stays open.

## Features

- **Duplicate detection** for the current window, grouped into sets of matching tabs.
- **Smart matching** ignores the `#fragment` and common tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `ref`, and similar), so `page?utm_source=x` and `page` count as the same tab.
- **Clear keep/delete labels** on every tab before anything is closed.
- **One-click cleanup** with a confirmation prompt.
- **Tabs by site** (optional setting) lists tabs that share a website, for reviewing a crowded window. Site groups are informational only and are never closed by the extension.
- **Private by design**: no data collected, nothing sent anywhere. The only stored value is your "Tabs by site" preference.

## Usage

1. Click the **Duplicate Tab Finder** toolbar icon.
2. Review the duplicate sets. Each tab is labelled **Keep tab** or **Delete tab**.
3. Click **Remove duplicates** and confirm. The first tab in each set stays open.
4. Click **Refresh** to rescan after changing your tabs.

To browse tabs from the same website, tick **Tabs by site**. The setting is remembered.

## Installation

Load it as an unpacked extension:

1. Clone the repository.
   ```bash
   git clone https://github.com/<your-username>/chrome-find-duplicate-tabs.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `tabs` | Read tab URLs and titles in the current window, and close duplicates. |
| `storage` | Remember the "Tabs by site" setting. |

## Project structure

```text
manifest.json              Extension manifest (Manifest V3)
popup.html                 Popup markup
popup.css                  Popup styles
popup.js                   Duplicate detection, rendering, and tab removal
assets/icon.svg            Vector master for the toolbar and store icon
assets/icons/              Generated PNG icons (16, 32, 48, 128 px)
tools/generate_icons.py    Rebuilds the icon files above
```

## Icon

The mark is the same tab twice: a muted duplicate behind, the tab that stays open in front, and the extra one badged in the same red the popup uses for **Remove duplicates**.

Every icon file is generated from the geometry in `tools/generate_icons.py`, which also writes the `assets/icon.svg` master, so the vector and the PNGs can never fall out of sync:

```bash
python3 -m pip install pillow
python3 tools/generate_icons.py
```

Edit the colors and shapes at the top of that file to change the icon, then commit the regenerated files.

## Authors

- **Russell Dickenson**
- **Claude** (Anthropic)

## License

Licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.txt).
