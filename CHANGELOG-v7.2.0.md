# SF Flow Utility Toolkit — v7.2.0

A reworked launcher and menu: you can hide or move the side button, the
menu is grouped and keyboard-friendly, and the toolbar icon and
Cmd/Ctrl+Shift+U open it from anywhere on the page.

## Side button

New **Side Button** settings (Settings → General):

- **Hide the side button.** The ⚡ button isn't added to the page at all,
  so it no longer shows in screenshots or screen recordings. Open the
  menu with Cmd/Ctrl+Shift+U or the toolbar icon.
- **Edge:** right (default) or left. The menu opens from the same side.
- **Position:** drag the button up or down its edge, and it stays there.
  **Reset position** puts it back in the middle.
- **Opacity when idle:** 100%, 75%, 50% or 25%. The button is always
  fully visible on hover, while it has focus, and while the menu is
  open.

All four apply straight away in open Salesforce tabs.

The side button no longer appears on pages where the menu would be
empty. On the Flow details page, Version Manager and Where Is This Used
keep their own buttons in the page.

## Menu

- **Grouped** under Canvas, Analyse, Assist and Move in Flow Builder.
  Setup pages, which have four tools or fewer, stay a simple list.
- **Toggles are one row with a switch.** Missing Description Flags and
  Setup Tabs show whether they're on. While Missing Description Flags is
  on, the ↻ button on its row refreshes the flags, in place of the
  separate "Refresh Missing Descriptions" entry.
- **Filter:** in Flow Builder, the menu opens with a filter box. Start
  typing to narrow the list, and press Enter to run the first match.
- **Keyboard:** use the arrow keys to move, Home and End to jump, Enter
  or Space to run a tool, and Escape to close. Focus returns to where it
  was. Keys pressed in the menu no longer reach Flow Builder.
- **No more scrolling:** the menu grows with its tools and only scrolls
  once it reaches the height of the window.
- Find Unused Resources has a new icon (🧹), so it no longer looks like
  Search & Highlight's.

## Toolbar icon and Cmd/Ctrl+Shift+U

- **Toolbar icon:** clicking the toolkit's icon in the browser toolbar
  opens and closes the menu. Pin it from the browser's extensions menu.
  On pages where the toolkit has no tools, such as the Flow details page
  or a non-Salesforce tab, the toolbar icon opens Settings. This is
  expected.
- **Cmd/Ctrl+Shift+U is now a browser shortcut.** It works wherever focus
  is on the page, including inside Setup pages' frames, where it didn't
  before. You can change it in the browser's extension shortcut
  settings. It still follows the Keyboard Shortcuts setting.

No new permissions.

## Fixes

- With Keyboard Shortcuts on, Cmd/Ctrl+Shift+U didn't stop the browser's
  own handling of that key combination.
- The menu no longer watches every change on the page for URL changes,
  which ran constantly in Flow Builder.
