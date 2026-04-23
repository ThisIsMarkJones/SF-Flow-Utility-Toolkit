---
layout: default
title: What's New
---

# What's New

Latest updates for **SF Flow Utility Toolkit**.

This page highlights recent releases, feature updates, fixes, and other notable changes.

{% if site.posts and site.posts.size > 0 %}
  {% for post in site.posts %}
  <div class="note-box">
    <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
    <p><em>{{ post.date | date: "%-d %B %Y" }}</em></p>

    {% if post.excerpt %}
    <p>{{ post.excerpt | strip_html }}</p>
    {% endif %}

    <p><a href="{{ post.url | relative_url }}">Read more</a></p>
  </div>
  {% endfor %}
{% else %}
<div class="note-box">
  <p>No updates have been published yet.</p>
  <p>Release notes and feature updates will appear here over time.</p>
</div>
{% endif %}
