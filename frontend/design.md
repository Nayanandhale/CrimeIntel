# CrimeIntel — UI/UX Design Specification

**Project:** CrimeIntel  
**SIH PS:** AI-Powered Criminal Network Analysis System  
**Reference direction:** The uploaded screenshots show a clean, light public-service interface with cyan/teal accents, a compact context/location strip, simple navigation, readable charts and task-focused screens.

## 1. Overall design direction

Use a **clean, calm, organized investigation interface** inspired by the supplied screenshots. The previous neon/HUD/cyberpunk direction is explicitly rejected. CrimeIntel should feel practical, credible, accessible, and easy to scan—not like a futuristic movie interface or a generic AI dashboard.

Make the product distinctive through information hierarchy and thoughtful workflows, not visual effects.

Principles:
- One primary task per screen.
- Clear labels: “Cases”, “Evidence”, “Review Queue”, “Related Cases”.
- Evidence before AI: every suggested connection is inspectable.
- Progressive disclosure: advanced filters belong in a dropdown or expandable panel.
- Generous whitespace; avoid clutter and too many cards.
- Keep primary navigation short.
- Never use government seals/insignia or imply live CCTNS/ICJS access.
- Mark the environment clearly as **Synthetic demo data**.

## 2. CrimeIntel logo

Use a simple, flat, 2D logo: a small network mark made from three/four connected nodes, paired with a readable `CrimeIntel` wordmark. Use navy and teal. The logo should remain recognizable at 24–32 px.

Do not use a glowing fingerprint, 3D metallic text, red neon, lens flares, HUD rings, or complex crime-scene illustration. A sample editable vector logo is included as `crimeintel-logo.svg`.

Usage:
- App header: compact icon + wordmark.
- Favicon: icon only.
- Login: larger wordmark, still understated.
- On dark backgrounds, use a white wordmark and teal mark.
- Do not make the logo a giant hero graphic.

## 3. Design tokens

```css
:root {
  --ci-navy: #153746;
  --ci-teal: #0EA5B7;
  --ci-teal-dark: #087F8C;
  --ci-teal-soft: #E6F8FA;
  --ci-page: #F5F8FA;
  --ci-surface: #FFFFFF;
  --ci-surface-muted: #F0F5F7;
  --ci-border: #D8E4E8;
  --ci-text: #18323D;
  --ci-text-muted: #5D737C;
  --ci-success: #23836D;
  --ci-warning: #B7791F;
  --ci-danger: #B84747;
  --ci-info: #386E9B;
  --ci-radius-sm: 6px;
  --ci-radius-md: 10px;
  --ci-radius-lg: 14px;
  --ci-shadow: 0 2px 8px rgba(21, 55, 70, 0.06);
}
```

Teal is for primary actions/selection; navy for headings; green for verified/approved; amber for pending review; muted red only for critical/rejected states. Never use colour as the only status indicator.

## 4. Typography and spacing

- Font: Inter, Source Sans 3, or system sans-serif.
- Page title: 24–28 px semibold.
- Section heading: 16–18 px semibold.
- Body: 14–16 px.
- Metadata: 12–13 px, with good contrast.
- Use an 8 px spacing rhythm: 8, 16, 24, 32 px.
- Use sentence case; avoid excessive all-caps labels.
- Keep paragraphs and tables readable without stretching across the whole screen.

## 5. Application shell and navigation

### Desktop shell
- Top bar: logo, global search, “Synthetic demo data” label, notifications, user menu.
- Optional short context strip for current unit/case.
- Collapsible left sidebar: 220–240 px expanded, 64–72 px collapsed.
- Main area: responsive, max width around 1440 px, 24 px padding.
- Right-side drawer for evidence details; do not keep it open permanently.

### Primary navigation
1. Overview
2. Cases
3. Network
4. Review Queue
5. Entities
6. Reports
7. Audit (role-restricted)

Put Profile, Settings and Help in the user menu or sidebar footer. Do not create a top-level item for every feature. Within a case, use a small sub-navigation: Overview, Evidence, Network, Timeline, Related Cases, Draft/Report.

## 6. Shared components

### Case header strip
One compact horizontal section showing Case ID/title, status, priority, opened date/age, last meaningful update, and assigned unit/owner. Use subtle separators, not a row of oversized cards.

### Status labels
Use small text pills: `Open`, `Pending`, `Closed`, `AI suggested`, `Verified`, `Needs review`, `Rejected`. Suggested relationships must look different from verified relationships.

### Tables
Use clear headings, compact rows, search, sorting, filters and pagination. Keep row actions in a menu or one contextual action. Do not place every possible field in the table.

### Filters
Show only 2–4 common filters inline. Put the rest behind “Filters”. Show removable active-filter chips and “Clear all”.

### Charts
Use charts only when they answer a question. Prefer horizontal bars, small trend lines and readable timelines. Avoid 3D charts, decorative pie charts and heavy gradients. Include tooltips and a table/list alternative.

### Empty, loading and error states
- Empty state should suggest the next action.
- Use skeleton rows and clear status text such as “Extracting entities from document…”.
- Never fake success. Provide retry for recoverable errors.
- If LLM/vector search is unavailable, explain the limitation and offer deterministic search if possible.

## 7. Screen-by-screen requirements

### 7.1 Overview / Command Center
Purpose: show what needs attention now.
- Page title and short context line.
- One concise summary row: Open Cases, High-Priority Cases, Suggestions to Review, Stale Cases.
- Main content: “Cases needing attention” table on the left; “Review queue” and “Recent activity” on the right.
- Optional small case-age trend below.
- Each metric navigates to its filtered list.
- Do not add 10–15 metric cards.

### 7.2 Cases
- Search by case ID, title, city, person, phone or vehicle.
- Default columns: Case ID, Title, City/Unit, Status, Priority, Opened, Last Update.
- Inline filters: status, priority and date range; advanced filters in a panel.
- Clicking a row opens the case workspace.
- Only show actions that are implemented.

### 7.3 Case Workspace
Use the case header strip and text tabs: Overview, Evidence, Network, Timeline, Related Cases, Draft/Report. Active tab uses a clear teal underline.
Overview shows a short summary, key entities, latest activity, pending validations, related-case suggestions and a clear “View evidence” action.

### 7.4 Evidence Intake / Upload
- Clear upload zone for supported types only (PDF, DOCX, TXT, CSV if implemented).
- Show file name, size, parse status and source classification.
- After parsing, show an extraction review table: entity, type, extracted text, suggested canonical match, confidence and action.
- Let users accept/edit/reject extracted entities before they enter the graph.
- Do not auto-merge ambiguous identities.
- If OCR is not implemented, explain that scanned documents may need OCR.

### 7.5 Network Graph
- Graph occupies the main area.
- Slim toolbar: case/entity selector, relationship-type filter, status filter, confidence threshold, reset.
- Advanced settings go in a dropdown.
- Keep the legend small.
- Verified edges are solid; AI-suggested edges are dashed.
- Clicking a node opens a compact profile; clicking an edge opens the Evidence Drawer.
- Provide a table/list alternative.
- Default to one case or selected entity, not the entire database.

### 7.6 Evidence Drawer
This is CrimeIntel’s signature interaction. Show:
- Relationship type/status and source/target.
- Confidence plus a plain-language explanation.
- Supporting documents and extracted snippets.
- First seen / last seen.
- Factors behind a cross-case suggestion.
- Validation history.
- Approve, Reject, Request More Evidence actions according to role.
- Source documents should be openable in a side-by-side viewer.
Avoid a giant modal or raw JSON dump.

### 7.7 Cross-Case Links
- Table-first layout, with optional graph/constellation view.
- Columns: Case A, Case B, Link Type, Shared Entities, MO Similarity, Temporal/Spatial Factors, Semantic Similarity, Confidence, Status.
- Sort pending review first.
- Each row has “Explain link”.
- Distinguish `Explicit match` from `Similarity-based lead`.
- Keep the notice: “A suggested link is an investigative lead, not proof of a common offender.”

### 7.8 Timeline
- Horizontal or vertical evidence rail with dates and event markers.
- Filters: event type, location, source, date range.
- Selecting an event opens its source.
- Group multiple events by day if needed.
- Include a compact chronological table alternative.

### 7.9 Review Queue
- Table of pending relationships and unresolved entity matches.
- Columns: Item, Related Case/Entity, Reason, Confidence, Source Count, Age, Status.
- Approve/reject/request-more-evidence actions require confirmation and optional comment.
- Update the list without full reload.
- Rejected suggestions remain in audit history.

### 7.10 Entity Profile
- Header: canonical entity ID, display name, type and resolution status.
- Sections: Identity Variants, Related Cases, Phones, Vehicles, Organizations, Timeline, Relationships, Sources.
- Explain why aliases were matched and show confidence.
- Use a “Possible duplicate” workflow rather than automatic merge.
- High centrality must never be presented as guilt.

### 7.11 Ask the Evidence
- Embed the assistant in the current case, not a floating chat bubble.
- Use a simple prompt box and context-aware suggested questions.
- Answers include source chips and case/document references.
- Show when evidence is insufficient.
- Apply case permissions to retrieval.
- Keep answers concise, with expandable “Evidence used”.
- Never invent relationships or override validation.

### 7.12 Draft Workspace
- Structured draft with source references.
- Visible banner: **“AI-assisted draft — requires investigator/legal review.”**
- Unknown facts become `[VERIFY]` or are omitted.
- Keep “Generate draft” separate from “Export”.
- Never call it a filed/final chargesheet.

### 7.13 Reports
- List reports with case, type, creator, date and status.
- Preview before export and retain source references.
- Do not show fake enabled export actions.

### 7.14 Audit
- Filters by date, user, role, action and case.
- Columns: Timestamp, User, Action, Object, Outcome.
- Table-first, readable and role-restricted.
- Audit entries cannot be edited through normal UI.

### 7.15 Profile and Settings
- User role/unit, preferences if implemented, data/source status and demo-data notice.
- Light mode first; dark mode is optional.
- Avoid unnecessary settings screens.

## 8. Map and location views

If included, use a low-contrast base map. Teal pins indicate known evidence locations; amber pins indicate suggested locations. Selecting a pin opens a compact evidence summary. Include a list view and label all locations as synthetic demo data.

## 9. Responsive behavior

- Desktop is the main target.
- Tablet: collapse sidebar and let the evidence drawer use more width.
- Mobile: convert tables to compact row cards only when necessary.
- Graph filters collapse into a Filters panel.
- Do not shrink a desktop graph until labels overlap.
- Keep primary actions accessible without hover.

## 10. Accessibility

- Good text contrast and visible keyboard focus.
- Every icon-only button has an accessible label.
- Status must not rely on colour alone.
- Graph insights must also be available as a list/table.
- Support keyboard navigation for tabs, menus, dialogs and drawers.
- Use semantic heading order.

## 11. Interaction details

- Short transitions (120–180 ms) only for state changes.
- No parallax, animated backgrounds, glowing effects or continuous motion.
- Preserve current case and filters during navigation.
- Confirm validation decisions and destructive actions.
- Show the result of actions; important decisions should remain visible in the record.
- All visible controls must work. If not implemented, disable them with a clear explanation.

## 12. Preferred wording

Use plain English:
- “Suggested connection” not “AI-proven link”
- “Needs review” not “Suspicious person”
- “Evidence source” not “AI rationale”
- “Network position” not “criminal influence”
- “Draft report” not “Final chargesheet”
- “Not enough evidence” rather than an invented answer

## 13. Anti-patterns to avoid

- Neon red/blue cyberpunk styling
- 3D metallic logo, glowing fingerprint or lens flares
- Purple gradients and oversized AI hero banners
- 10–15 metric cards on one dashboard
- Every feature as a top-level navigation item
- Excessive tabs, nested tabs or huge filter panels
- Floating chatbot bubble
- Decorative charts without a clear purpose
- Opaque risk scores
- Graph edges without evidence
- Default component-library styling left untouched
- Fake live data, fake government integration or fake success states

## 14. Acceptance checklist

- Matches the clean cyan/teal public-service feel of the supplied screenshots.
- New users can find Cases, Review Queue and Network quickly.
- Default dashboard is not crowded.
- Case pages use compact headers and restrained sub-navigation.
- Clicking a relationship reveals evidence and validation status.
- Suggested and verified relationships look different.
- Synthetic/demo-data status is always clear.
- Every action works or is clearly disabled.
- UI works at laptop resolutions and with keyboard navigation.
- CrimeIntel logo remains legible at small sizes.
