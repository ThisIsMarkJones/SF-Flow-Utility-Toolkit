# Synthetic fixtures — NOT captured from an org

Everything in this folder is hand-written or hand-edited. Prefer `../fixtures/` wherever a real capture exists.

| File | What it is |
|---|---|
| `SFUT_W27_GroupsSynthetic.flow-meta.xml` | Flow with two elements in group `Setup_Steps` (with a description) and one outside, written from the API 68.0 WSDL (`FlowNodeGroup`, `FlowNode.group`). **The org rejected it** (see below). |
| `SFUT_W27_GroupsSynthetic.tooling.json` | The Tooling API shape of the real `SFUT_W27_Groups` probe, with `group` set on `Step_One`/`Step_Two` and a `groups` entry added using every `FlowNodeGroup` field from the WSDL. |
| `SFUT_W27_EndElements.outcome-to-end.tooling.json` | Hand-edited copy of `fixtures/winter27/SFUT_W27_EndElements.saved.tooling.json`: the Decision outcome `Path_A_Outcome` points straight at `END_ELEMENT_3`, and the `Path_A` assignment is removed. |

## Groups deploy errors (org `sfut-w27`, 2026-09-24)

Source-format deploy (package version taken from `sourceApiVersion` 67.0):

```
Setup_Steps (Group) - Group elements require API version 68.0 or later. Update your request’s API version and try again.
```

Metadata-format deploy with `package.xml` `<version>68.0</version>`:

```
Setup_Steps (Group) - This org doesn’t support the generic FlowNodeGroup. Remove all groups from the flow and try again.
```
