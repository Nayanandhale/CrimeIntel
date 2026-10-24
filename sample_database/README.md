# Synthetic Criminal Network Analysis Demo Database

**Status:** Entirely synthetic/demo data. No real person, phone number, vehicle, FIR or police record is represented.

## Dataset size
- Persons: 50
- Cases: 30
- Documents: 90
- Locations: 30
- Vehicles: 30
- Phones: 40
- Organizations: 10
- Case-person links: 146
- Evidence-backed graph relationships: 154
- Timeline events: 142
- Cross-case links: 15
- Validation records: 120
- Alerts: 27
- Anomaly signals: 6

## Designed test coverage
1. **Entity extraction:** document_narratives contains names, aliases, phones, vehicles, locations and organizations.
2. **Entity resolution:** entity_aliases deliberately contains variants such as `Bunty Patil`, `Bunty P.`, and vehicle formatting variants.
3. **Graph:** relationships contains person-person, person-phone, person-vehicle, person-organization and case-case links.
4. **Centrality:** communities and bridge persons create non-trivial degree/betweenness differences.
5. **Community detection:** four seeded communities plus bridge nodes.
6. **Cross-case linking:** case_links includes explicit and similarity-driven links.
7. **Semantic linking:** several `SEMANTIC_CASE_SIMILARITY` links have zero/low explicit shared entities by design.
8. **Temporal analysis:** case_events provides multiple dated events per case.
9. **Explainability:** every graph relationship has source_document_id, confidence, evidence_status and explanation.
10. **Human validation:** validations contains approved/rejected/needs_review examples.
11. **Case dashboard:** cases contains status, priority, opened_date and last_update; alerts includes aging/pending-review alerts.
12. **Anomaly detection:** anomalies provides demo signals for burst activity, unusual location, entity reuse and bridge nodes.
13. **AI assistant/RAG:** document_narratives is the text corpus; use PostgreSQL + pgvector for embeddings.
14. **Chargesheet draft:** use verified case/person/event/evidence records as structured context; the LLM must only draft, never finalize.

## Loading
### PostgreSQL
1. Create a database.
2. Run `seed.sql`.
3. If pgvector is unavailable, remove the `CREATE EXTENSION vector` line and the embedding column; semantic retrieval can temporarily use a local in-memory embedding index.
4. The CSVs are provided for teams that prefer pandas ingestion.

## Suggested demo queries
- `P005` — high-connectivity person with deliberate alias and shared-asset links.
- `C001` — open case with multiple evidence types and a semantic cross-case connection.
- `C013` — useful counterpart for a similarity investigation.
- `C005` and `C021` — semantic case-link demonstration.
- Filter `alerts` by severity=`critical` or `high`.
- Compare approved vs ai_suggested relationships.
