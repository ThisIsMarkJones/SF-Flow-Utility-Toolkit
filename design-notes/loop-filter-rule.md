# Design note: Health Check rule for a loop used only to filter a collection

Status: **parked** for a later release (decided 2026-09-24). Not implemented.

## What it detects

A Loop whose body only decides whether to keep the current item and adds it to another collection. The flow runs a Decision and an Assignment for every record. Salesforce's Collection Filter element does the same job in one element, and so does the Collection Filter Criteria resource from Winter '27 (API 68.0).

Reference fixture: `tests/fixtures/winter27/SFUT_W27_LoopFilter.tooling.json`

```
Get_Accounts → Loop_Accounts ─nextValue→ Is_Match ─Technology→ Add_Match → Loop_Accounts
                                          └─Not a Match────────────────→ Loop_Accounts
Add_Match: matchingAccounts  Add  {!Loop_Accounts}
```

## Why `_computeLoopMembership()` isn't enough yet

`utils/flow-health-normalizer.js` `_computeLoopMembership(nodes, edges)` does one breadth-first walk from every loop's `nextValue` target, skipping `fault` and `noMoreValues` edges. It records *whether* a node is in a loop, and how deep, but not *which* loop. The walk also flows back into the loop node itself: on the fixture, `Loop_Accounts`, `Is_Match` and `Add_Match` are all `isInLoop: true` at depth 1.

## Proposed approach

1. **Membership for each loop.** Run the same walk once per loop: start at that loop's `nextValue` target, stop when you reach the loop node, and skip `fault` and `noMoreValues` edges. Return `byLoop: { loopName: Set(bodyNodeNames) }` alongside the existing `byNode`, so current rules are unaffected.
2. **A loop is "filter-only" when every one of these holds:**
   - The body contains only `Decision` and `Assignment` nodes, and at least one `Decision`.
   - Every Assignment item is `operator: Add` onto one collection variable, with the value being the current item: `value.elementReference` is the loop name, or the loop's `assignNextValueToReference`.
   - All Assignments add to the same collection.
   - Decision conditions only reference the current item's fields (`<Loop>.Field`), constants, or variables that are not changed inside the loop.
   - The default outcome doesn't add the item. If both outcomes add it, the loop is really a copy, not a filter.
3. **Not filter-only:** anything else in the body, such as another Assignment, Get Records, Create/Update/Delete Records, an action, a subflow or a screen.
4. **Finding:** `LOOP_ONLY_FILTERS`, severity low, category performance. Message: "Loop <label> only filters <collection> into <target>." Recommendation: "Use a Collection Filter element or, on Winter '27 and later, a Collection Filter Criteria resource."
5. **Tests:** the fixture as the positive case, plus hand-edited negative cases: an extra Assignment that sets another variable, two target collections, the default outcome also adding the item, and a DML element in the body.

## Open questions

- Should a loop that also sorts (for example by adding in order) point to Collection Sort, or to Collection Filter Criteria's sort options?
- Nested loops: only flag the innermost loop, or skip nested loops entirely?
