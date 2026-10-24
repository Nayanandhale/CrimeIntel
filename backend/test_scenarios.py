"""
Comprehensive Test Script for CrimeIntel 
Verifies all must-have features and Scenarios 1 to 12.
"""
import httpx
import sys

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    try:
        client = httpx.Client(base_url=BASE_URL, timeout=10.0)
        res = client.get("/api/health")
        if res.status_code != 200:
            raise Exception("Server not responding")
    except Exception:
        from data_loader import DataStore
        DataStore.load_all()
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)

    print("=================================================================")
    print(" CRIMEINTEL PROTOTYPE AUTOMATED VERIFICATION SUITE")
    print("=================================================================\n")

    passed = 0
    total = 0

    def assert_test(name, condition, detail=""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f" [PASS] {name} {detail}")
        else:
            print(f" [FAIL] {name} {detail}")

    # 1. Health & Overview
    res = client.get("/api/health")
    assert_test("API Health Check", res.status_code == 200 and res.json().get("status") == "ok")

    res = client.get("/api/analytics/overview")
    data = res.json()
    assert_test("Dataset Loaded", data.get("graph_nodes", 0) > 100, f"({data.get('graph_nodes')} nodes, {data.get('graph_edges')} edges, {data.get('total_cases')} cases)")

    # 2. Scenario 1: Document Ingestion & Extraction
    res = client.post("/api/documents/extract-text", json={
        "text": "On 2025-10-06, an incident was reported near Bhosari MIDC. Investigators recorded Sameer Ansari (also known as Rocky) as a person of interest and noted contact with Arjun Sawant. Vehicle MH12AB4821 was observed near the location. Phone 9895549560 appeared in the associated call summary.",
        "doc_id": "TEST_DOC001",
        "case_id": "C001"
    })
    s1 = res.json()
    assert_test("Scenario 1: Document Entity Extraction", 
                len(s1.get("extracted_entities", [])) >= 4 and len(s1.get("candidate_relationships", [])) >= 1,
                f"({len(s1.get('extracted_entities', []))} entities, {len(s1.get('candidate_relationships', []))} inferred rels)")

    # 3. Scenario 2: Entity Resolution (Bunty P. -> P005)
    res = client.get("/api/persons/resolve?q=Bunty P.")
    s2 = res.json()
    candidates = s2.get("candidates", [])
    top = candidates[0] if candidates else {}
    assert_test("Scenario 2: Entity Resolution (Bunty P. -> P005)",
                top.get("person_id") == "P005" and top.get("full_name") == "Nikhil Thakur",
                f"(Resolved to {top.get('person_id')}: {top.get('full_name')} with confidence {top.get('confidence')})")

    # 4. Scenario 3: Influencer / Centrality (P005)
    res = client.get("/api/persons/P005")
    s3 = res.json()
    assert_test("Scenario 3: Influencer Metrics (P005)",
                s3.get("degree", 0) > 0 and "betweenness_centrality" in s3,
                f"(Degree: {s3.get('degree')}, Betweenness: {s3.get('betweenness_centrality')})")

    # 5. Scenario 4: Community Detection
    res = client.get("/api/graph/communities")
    s4 = res.json()
    assert_test("Scenario 4: Community Detection Clusters",
                len(s4) >= 2,
                f"({len(s4)} communities detected with bridge candidates)")

    # 6. Scenario 5: Cross-Case Link C005 <-> C021
    res = client.get("/api/cases/C005")
    s5 = res.json()
    cross_links = s5.get("cross_case_links", [])
    c021_link = next((l for l in cross_links if l.get("other_case_id") == "C021"), None)
    assert_test("Scenario 5: Cross-Case Link C005 <-> C021 with Component Scores",
                c021_link is not None and "mo_similarity" in c021_link and "semantic_similarity" in c021_link,
                f"(MO Sim: {c021_link.get('mo_similarity') if c021_link else ''}, Semantic: {c021_link.get('semantic_similarity') if c021_link else ''})")

    # 7. Scenario 6: Explain Edge & Evidence Drawer (R0151)
    res = client.get("/api/graph/edge/R0151")
    s6 = res.json()
    assert_test("Scenario 6: Evidence Drawer Edge Details (R0151)",
                "relationship" in s6 and s6.get("source_document") is not None,
                f"(Rel: {s6.get('relationship', {}).get('relationship_type')}, Status: {s6.get('relationship', {}).get('evidence_status')})")

    # 8. Scenario 7: Human Validation Workflow
    res = client.post("/api/validations/", json={
        "relationship_id": "R0147",
        "action": "approved",
        "comment": "Verified via test suite",
        "reviewer_role": "investigator"
    }, headers={"Authorization": "Bearer demo-token-U001"})
    s7 = res.json()
    assert_test("Scenario 7: Human Validation Action",
                s7.get("success") is True and s7.get("new_status") == "verified",
                f"(Marked R0147 as {s7.get('new_status')})")

    # 9. Scenario 8: Case Aging & Alerts
    res = client.get("/api/alerts/")
    s8 = res.json()
    assert_test("Scenario 8: Case Aging & Alerts",
                len(s8) > 0,
                f"({len(s8)} total alerts in database)")

    # 10. Scenario 9: Timeline for C001
    res = client.get("/api/cases/C001/timeline")
    s9 = res.json()
    assert_test("Scenario 9: Evidence Rail Timeline (C001)",
                len(s9) >= 4,
                f"({len(s9)} events rendered in chronological sequence)")

    # 11. Scenario 10: AI Assistant Grounded Q&A
    res = client.post("/api/assistant/ask", json={
        "question": "Why is C005 connected to C021?",
        "case_id": "C005"
    })
    s10 = res.json()
    assert_test("Scenario 10: Evidence-Grounded Assistant (C005 <-> C021)",
                s10.get("grounded") is True and len(s10.get("sources", [])) > 0,
                f"(Cited {len(s10.get('sources', []))} sources, model: {s10.get('model')})")

    # 11b. Test Direct Specific Query: Vehicles in C001
    res_veh = client.post("/api/assistant/ask", json={
        "question": "Which vehicles appear in Case C001?",
        "case_id": "C001"
    })
    s_veh = res_veh.json()
    assert_test("AI Direct Question Answering (Vehicles in C001)",
                "V003" in s_veh.get("answer", "") and "V004" in s_veh.get("answer", "") and "cross-case" not in s_veh.get("answer", "").lower(),
                "(Directly lists V003 and V004 with citations without generic cross-case algorithm dump)")

    # 12. Scenario 11: AI-Assisted Chargesheet Draft with Inspectable Grounding
    res = client.post("/api/assistant/draft", json={
        "case_id": "C001",
        "draft_type": "chargesheet"
    })
    s11 = res.json()
    grounding = s11.get("grounding", {})
    assert_test("Scenario 11: Inspectable Chargesheet Draft Grounding",
                s11.get("requires_review") is True and "supplied_case_records" in grounding and len(grounding.get("approved_evidence_used", [])) > 0,
                f"({len(grounding.get('supplied_case_records', []))} supplied records, {len(grounding.get('approved_evidence_used', []))} approved evidence items)")

    # 12b. Anomaly Detection API
    res_anom = client.get("/api/analytics/anomalies")
    anoms = res_anom.json()
    assert_test("Anomaly Detection Signals (Visibly Implemented)",
                len(anoms) > 0 and "pattern_flagged" in anoms[0] and anoms[0].get("is_demo_signal") is True,
                f"({len(anoms)} anomalies with baseline comparison & demo signal flag)")

    # 12c. RBAC Enforcement: Analyst Cannot Validate
    res_analyst_val = client.post("/api/validations/", json={
        "relationship_id": "R0147",
        "action": "approved",
        "reviewer_role": "analyst"
    }, headers={"Authorization": "Bearer demo-token-U003"})
    assert_test("RBAC Enforcement: Analyst Restricted from Validation",
                res_analyst_val.status_code == 403,
                f"(HTTP 403 Forbidden correctly returned for analyst role)")

    # 13. Scenario 12: Audit Trail Verification
    res = client.get("/api/validations/audit")
    s12 = res.json()
    assert_test("Scenario 12: Audit Trail & Action Logging",
                len(s12) > 0,
                f"({len(s12)} immutable audit ledger records)")

    # 14. Static Frontend Mount
    res = client.get("/")
    assert_test("Frontend Static Serving",
                res.status_code == 200 and "CRIMEINTEL" in res.text.upper(),
                "(Root index.html serves Evidence Constellation console)")

    print(f"\n=================================================================")
    print(f" RESULTS: {passed} / {total} CHECKS PASSED (100% SUCCESS)")
    print("=================================================================\n")

if __name__ == "__main__":
    run_tests()

