# Winter '27 fixtures (API 68.0)

Captured from the Developer Edition org `sfut-w27` on 2026-09-24. Each flow has two files:

- `*.flow-meta.xml` — Metadata API retrieve
- `*.tooling.json` — Tooling API `SELECT ApiVersion, VersionNumber, Status, ProcessType, RunInMode, Metadata FROM Flow`, which is what the extension reads

| Fixture | How it was made | Package version of the XML retrieve |
|---|---|---|
| `ImportTest.before` | Imported with the toolkit's Import feature from a pre-Winter '27 export (flow API 49.0); never opened in Flow Builder | 67.0 (that state no longer exists in the org) |
| `ImportTest.after` | The same flow after an edit-and-revert save in Flow Builder (Winter '27) | 68.0 |
| `SFUT_W27_EndElements.deployed-no-end` | Deployed via metadata, before any Flow Builder save | 67.0 (that state no longer exists in the org) |
| `SFUT_W27_EndElements.saved` | The same flow after an edit-and-revert save in Flow Builder | 68.0 |
| `SFUT_W27_LoopFilter` | Deployed via metadata, not built in Flow Builder | 68.0 |
| `SFUT_W27_UserMode` | Deployed via metadata, not built in Flow Builder | 68.0 |
| `SFUT_W27_CFCSynthetic` | **Deployed via metadata, not built in Flow Builder.** Written from the API 68.0 WSDL. The org stored it with status `InvalidDraft`, because Collection Filter Criteria isn't enabled in this org yet | 68.0 |

`schema/` holds the type definitions extracted from the org's Metadata API WSDL (API 68.0): `FlowNodeGroup`, `FlowEnd`, `FlowCollectionFilterCriteria` and its option types, `FlowNode` (which carries the per-element `group` field), `FlowRunInMode`, and the relevant `Flow` fields.

## Things to know

- A source-format `sf project retrieve start --metadata ...` uses the project's `sourceApiVersion` as the package version, even with `--api-version 68.0`. At 67.0 the retrieve silently drops `<ends>`. Retrieve with a manifest whose `<version>` is `68.0`.
- End element names (`END_ELEMENT_n`) are numbered in sequence across the flow and aren't stable between flows.
- Groups couldn't be captured: see `../../synthetic/README.md`.
