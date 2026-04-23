---
layout: default
title: "What's New"
---

# What's New

Latest updates for **SF Flow Utility Toolkit**.

This page highlights recent releases, feature updates, fixes, and other notable changes.

## Latest updates

<div class="quick-links">
  {% for post in site.posts limit:4 %}
    <a href="{{ post.url | relative_url }}">
      {{ post.title }}
    </a>
  {% endfor %}
</div>

## Updates by category

{% if site.categories and site.categories.size > 0 %}
  {% assign sorted_categories = site.categories | sort %}
  {% for category in sorted_categories %}
### {{ category[0] }}

<ul>
  {% assign posts_in_category = category[1] | sort: "date" | reverse %}
  {% for post in posts_in_category %}
    <li>
      <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      <small>— {{ post.date | date: "%-d %B %Y" }}</small>
    </li>
  {% endfor %}
</ul>

  {% endfor %}
{% else %}
<div class="note-box">
  <p>No updates have been published yet.</p>
  <p>Release notes and feature updates will appear here over time.</p>
</div>
{% endif %}
