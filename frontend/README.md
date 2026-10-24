# CrimeIntel Frontend Documentation & Case Workspace Architecture

## 1. Directory Structure

The frontend application follows a clean, modular structure with centralized styling and isolated case management workflows:

```
frontend/
├── index.html              # Main application shell with semantic layouts & accessible IDs
├── crimeintel-logo.svg     # Clean, trimmed vector logo (Navy #153746 & Teal #0EA5B7)
├── css/
│   └── style.css           # Centralized theme tokens, design system, layout rules & modal styles
├── js/
│   └── app.js              # State management, case sync, RBAC controls, VisNetwork, & API clients
├── design.md               # UI/UX design specifications (civic/law-enforcement aesthetic)
└── README.md               # Architecture, navigation, and role-based access guide
```

---

## 2. Case Workspace Components vs Shared Components

To ensure high maintainability and prevent competing styles or state conflicts, components are categorized into two scopes:

### A. Case Workspace Components (Case-Dependent)
Updating the active case via `#caseSelect` synchronizes all of the following components simultaneously:
- **Case Header & Badges** (`#caseBadges`): FIR number, priority, city, station, MO code, and last record update.
- **Case Intelligence Digest** (`#caseDigestSection`): A 4-column summary dividing verified case status, verified key events, verified entities & seized items, and AI-suggested cross-case leads.
- **Network Graph & Focus Entity** (`#networkCanvas`): VisNetwork graph re-centered and scoped to the active case's ego-network with accurate node/edge counts.
- **Case Rail Timeline** (`#timelineEventsContainer`): Chronological sequence of incidents, surveillance sightings, CDR logs, and statements with dual-date audit fields (`event_occurrence_date` vs `record_entry_timestamp`).
- **Statistical Anomaly Badge & Inspector** (`#caseAnomalyBadge` / `#anomalyModal`): Clickable indicator displaying flagged heuristic patterns, 30-day baseline comparisons, affected entities, and demo signal disclaimers.
- **Case Alerts & Verification Queue** (`#caseAlertCount` / `#tab-validations`): Review queue for AI-suggested links with investigator action controls.
- **Chargesheet & Report Drafting** (`#chargesheetModal`): AI-assisted draft generator with an expandable **Sources and Evidence Used** grounding inspector.

### B. Shared Application Components (Global Scope)
- **Top Bar**:
  - Trimmed CrimeIntel logo (`crimeintel-logo.svg`).
  - Real-time System Health badge (`#systemHealthBadge` linked to `/api/health`).
  - Dynamic Graph Metrics badge (`#graphMetricsBadge` showing `${nodes.length} entities · ${edges.length} relationships`).
  - Full Authorized Alerts Bell (`#notificationBellBtn` / `#alertsModal`) providing multi-case filtering by severity, alert type, and status.
  - User session pill with role and jurisdiction display.
  - Theme toggle (light/dark mode with persisted tokens).
- **Sidebar Navigation**: Command & analysis tab switcher, jurisdiction indicator, and quick actions (FIR registration, evidence intake).

---

## 3. Role-Based Access Control (RBAC) in the UI

Permissions are strictly enforced both in the UI and on the FastAPI backend:

| Role | Permitted Views | Permitted Actions | Restricted / Disabled Actions |
| :--- | :--- | :--- | :--- |
| **Administrator** (`admin`) | District-wide views, Executive Dashboard, all cases | All actions (FIR registration, evidence attachment, relationship approval, case amendments, user oversight) | None |
| **Investigator** (`investigator`) | Authorized jurisdiction case workspace, Network Graph, Timeline, RAG Assistant | Case investigations, FIR registration, evidence attachment, AI link validation (Approve/Reject) | Executive district dashboard |
| **Analyst** (`analyst`) | Read-only analytics, Case Statistics, Geo-Map, Network Graph, Entity Resolution, RAG Assistant | Investigative queries, analytical note generation, read-only inspection | FIR registration and evidence modifications disabled; validation buttons replaced with read-only badge |

---

## 4. Evidentiary Standards & AI Integration Principles

1. **Direct Intent Answering**: The AI Assistant answers specific factual questions directly (e.g. "Which vehicles appear in Case C001?") before offering additional context. It never dumps unrelated cross-case linking algorithms.
2. **Transparent Model Labeling**: Technical internal names (`Llama 3.1 8B`, `structured_retrieval_fallback`) are removed from investigator screens in favor of clear labels like **Evidence-based answer**.
3. **No Unsolicited Prompts**: Automatic suggested question pills have been removed from the default assistant interface; a clean free-form query box is provided.
4. **Inspectable Grounding**: Draft reports include an expandable inspector detailing supplied case records, authorized evidence, source citations, unverified facts, and missing information checklists.
5. **Ethical Metrics**: Network centrality measures topological bridge positions and is explicitly disclaimed as not constituting guilt or criminal conspiracy.
