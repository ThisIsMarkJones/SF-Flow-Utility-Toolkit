---
layout: post
title: "Dark Mode and Winter '27"
categories: announcement
---

v7.1.0 adds a **dark theme** and makes the toolkit ready for Salesforce's **Winter '27** release.

## Dark mode

If you darken Salesforce with an extension such as Dark Reader, the toolkit's menus, panels and modals used to stay white. They now follow the page.

Choose a theme in **Settings → General → Appearance**:

* **Auto** (the default) matches each Salesforce page's own background, and switches when the page changes — for example when you turn Dark Reader on or off. It doesn't follow your operating system's setting, because Salesforce's own dark mode doesn't cover Setup or Flow Builder, so a dark system setting doesn't mean a dark page.
* **Light** and **Dark** use that theme everywhere, whatever the page looks like.

The Settings page itself follows your system setting when set to Auto.

## Winter '27

* The toolkit uses API 68.0, and still works with orgs that haven't upgraded yet.
* **Import / Export Flows** handles Winter '27's new End elements: re-saved but unchanged flows no longer show as different, and importing into an org that hasn't upgraded removes them first. If a fault path ends at an End element, which an older org can't express, the import stops and names the elements.
* **Flow Health Check** shows Flow Builder's own run context labels, including the new "User Context—Enforces User Permissions".
* **Flow Error Dictionary** adds UNABLE_TO_LOCK_ROW and STRING_TOO_LONG, and updates other entries for Winter '27.
* **Unused Resources** and **Missing Description Flags** understand the new Collection Filter Criteria resource, and Missing Description Flags checks group descriptions.
* **Search & Highlight** can search by element type again on Winter '27's redesigned canvas cards.
* **Comparison Exporter** warns when change details couldn't be read, since Winter '27 removed the Change Details column from Flow Version Comparison.
* Shift+Tab and Shift+arrow keys work normally in Flow Builder again.
