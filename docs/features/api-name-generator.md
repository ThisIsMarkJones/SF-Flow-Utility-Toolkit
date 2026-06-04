---
layout: default
title: API Name Generator | SF Flow Utility Toolkit
meta-description: Documentation for the Salesforce Flow Builder browser extension
---

# API Name Generator

## Overview

**API Name Generator** helps users generate standardised API names for Salesforce Flow elements and resources based on configured prefixes and naming conventions.

The feature improves naming consistency within Flow Builder by reducing manual entry and applying reusable naming rules across common Flow components.

![API Name Generator Inline Tag Button](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/api-name-generator/api-name-generator-inline-tag-button.png)

## Where it appears

API Name Generator is intended for **Salesforce Flow Builder**. It injects a generate button next to the **API Name** field in element and resource editors.

## What the feature does

1. Detects that the user is in Flow Builder.
2. Loads the configured naming pattern from settings.
3. Loads prefix definitions from custom storage or the shipped default configuration.
4. Watches the page for relevant Flow Builder property panels opening.
5. Injects a **Generate API Name** button (🏷️) next to supported API Name fields.
6. Reads the current label and detects the element or resource type.
7. Generates an API name using the configured naming pattern and matching prefix.
8. Writes the generated value into the API Name input.
9. Dispatches the required input, change, and blur events so Salesforce recognises the update.
10. Shows a toast confirming the generated result.

![API Name Generator Element Update](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/api-name-generator/api-name-generator-element-update.png)

## Naming patterns

Supported patterns:

- `Snake_Case`
- `PascalCase`
- `camelCase`

The configured naming pattern is read from settings and applied when generating the final API name.

![API Name Generator Settings Options](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/api-name-generator/api-name-generator-settings-options.png)

## Supported type coverage

### Standard Flow elements

Get Records, Create Records, Update Records, Delete Records, Decision, Assignment, Screen, Loop, Action, Subflow, Wait, Transform, Custom Error, Roll Back Records, Collection Sort, Collection Filter, and more.

### Resources

Variable, Formula, Collection, Constant, Text Template, Choice, Collection Choice Set, Record Choice Set, Picklist Choice Set — with subtype support for data types such as Text, Number, Boolean, Date, Record, and Apex-Defined.

### Screen component subtypes

Input, Display, Message, Repeater, Section, LWC.

### Orchestration-related types

Stage, Step.

![API Name Generator Resource Item Update](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/api-name-generator/api-name-generator-resource-item-update.png)

## Prefix customisation

The prefix system supports importing user-provided JSON to override the default mappings, exporting the active configuration, and resetting to defaults. Updates to custom prefix configuration are reflected without requiring a manual page refresh.

![API Name Generator Download/Upload Prefixes](https://thisismarkjones.github.io/SF-Flow-Utility-Toolkit/images/api-name-generator/api-name-generator-download-upload-prefixes.png)

## How to use it

1. Open a Flow in Salesforce Flow Builder.
2. Open the configuration panel for an element, resource, or supported screen component.
3. Enter a label if one is not already present.
4. Click the **Generate API Name** button (🏷️) next to the API Name field.
5. Review the generated API name and adjust manually if needed.

## Notes and limitations

- The feature depends on Flow Builder editor DOM structure and selectors remaining compatible.
- API Name generation quality depends on correct element/resource type detection.
- The feature falls back to hardcoded defaults if the JSON default file cannot be loaded.
