---
layout: default
title: "Setup Tabs Grouping is Now Available"
date: 2026-04-24 09:00:00 +0100
category: Release Update
excerpt_separator: <!--more-->
---

{% if page.category %}
<p>
  <span class="post-category-tag post-category-{{ page.category | slugify }}">
    {{ page.category }}
  </span>
</p>
{% endif %}

## {{ page.title }} ##

A small but handy update to the Setup Tabs feature. You can now group all of your configured Setup Tabs together under a single dropdown in the Salesforce Setup header, rather than having each one displayed as its own top-level item.

![Setup Tabs Upgrade (v1.1.0)]({{ 'docs/images/01_post_images/2026-04-24-setup-tabs-upgrade/grouped-tabs-in-list-view.png' | relative_url }})

This keeps the Setup header tidy if you've built up a long list of favourite Setup destinations — all your tabs are still a click away, just consolidated into one menu.

To enable it:

* Open the extension's **Settings** page
* Go to the **General** tab
* Toggle **Group Setup Tabs** on

![Setup Tabs Upgrade (v1.1.0)]({{ 'docs/images/01_post_images/2026-04-24-setup-tabs-upgrade/grouped-tabs-settings-toggle.png' | relative_url }})

Your existing Setup Tabs configuration is untouched — grouping only changes how they're presented. You can switch the grouping off again at any time.

This update ships as part of **v1.1.0**. Make sure your extension is up to date:

<a href="https://chromewebstore.google.com/detail/sf-flow-utility-toolkit/mjbmlikmdkcakcbilibhbgcjdnidkpfl" target="_blank" rel="noopener noreferrer">
        Install SF Flow Utility Toolkit on Google Chrome
      </a>

_N.B. This update will be submitted to Microsoft for review once the Edge Add-On becomes available._
