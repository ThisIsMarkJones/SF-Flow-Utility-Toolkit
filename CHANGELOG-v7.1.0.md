# SF Flow Utility Toolkit — v7.1.0

Dark mode, and compatibility with Salesforce's Winter '27 release
(API 68.0).

## Dark mode

The toolkit's menus, panels, modals and toasts now have a dark theme, so
they no longer show as white bands on a darkened page.

- **New Theme setting** (Settings → General → Appearance): Auto, Light or
  Dark. Auto is the default.
- **Auto follows the page itself**, not your operating system. It reads
  the background colour of each Salesforce page and switches when the page
  changes, for example when an extension such as Dark Reader is turned on
  or off. Salesforce's own dark mode doesn't cover Setup or Flow Builder,
  so a dark OS setting doesn't mean a dark page.
- **Light and Dark** apply that theme everywhere, whatever the page looks
  like.
- **The Settings page** follows your system setting in Auto.
- Elements the toolkit adds inside Salesforce pages (the Flow List Search
  bar, canvas flags, the Search & Highlight bar) follow the theme too.
  Buttons that deliberately copy Salesforce's own style, such as "Where Is
  This Used?", stay as they are.
- With Chrome's experimental "Auto Dark Mode for Web Contents" flag,
  Chrome darkens the page and the toolkit itself, so Auto can read a
  Setup page as light. The toolkit still appears dark, because Chrome
  darkens it.

No new permissions.

### Fixes found while building dark mode

- The close (×) button on Health Check, Unused Resources and the Scheduled
  Flow Explorer detail and day modals had no styling and appeared as a
  plain grey browser button. It now matches the other close buttons.

## Winter '27 compatibility

- **API 68.0, with older orgs still supported.** The toolkit reads each
  org's highest API version and uses the lower of that and 68.0 for every
  call, so orgs still on Summer '26 during the upgrade window keep
  working.
- **Import / Export:**
  - Winter '27 Flow Builder saves an explicit End element at every path
    end. Comparing a re-saved but unchanged flow no longer reports it as
    different.
  - Importing into an org that hasn't upgraded yet removes those End
    elements first, because older orgs reject them.
  - If a fault path ends at an End element, which an older org can't
    express, the import stops and names the elements instead of deploying
    a copy without the fault path.
- **Health Check:** run context shows Flow Builder's own labels, including
  Winter '27's "User Context—Enforces User Permissions".
- **Flow Error Dictionary:** new entries for UNABLE_TO_LOCK_ROW (Winter
  '27 now retries once) and STRING_TOO_LONG. REQUIRED_FIELD_MISSING
  mentions the new save-time warning, and APEX_CPU_TIME_LIMIT_EXCEEDED
  suggests Collection Filter Criteria in place of filter-only loops.
- **Collection Filter Criteria resource:** Unused Resources, Missing
  Description Flags and the AI Assistant's metadata summary understand
  it. It also has its own API name prefix (`CollFilter_`).
- **Groups:** Missing Description Flags also checks group descriptions.
- **Search & Highlight:** searching by element type (for example
  "Assignment") works again on Winter '27's redesigned canvas cards.
- **Comparison Exporter:** Winter '27 removed the Change Details column
  from Flow Version Comparison. When details were requested but none
  could be read, the export now warns instead of leaving the column empty
  without saying so.
- **Keyboard shortcuts:** Shift+Tab, Shift+arrows and other Shift
  combinations the toolkit doesn't use work normally in Flow Builder
  again.
- **API Name Generator:** the built-in fallback prefixes include
  Datatable and Radio Button Group.
