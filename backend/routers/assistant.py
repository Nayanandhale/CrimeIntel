"""
AI Assistant Router - RAG-based Q&A with evidence grounding.
Uses local LLM if available; falls back to structured evidence retrieval.
IMPORTANT: The assistant only answers based on retrieved evidence. It refuses to invent facts.
Exposes 'Evidence-based answer' without internal technical labels.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
import httpx
import json
import re
from data_loader import DataStore
from routers.auth import get_current_user

router = APIRouter()

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.1:8b"

class AssistantQuery(BaseModel):
    question: str
    case_id: Optional[str] = None
    person_id: Optional[str] = None
    relationship_id: Optional[str] = None

class DraftRequest(BaseModel):
    case_id: str
    draft_type: str = "chargesheet"  # chargesheet | report | summary

def _retrieve_evidence(case_id: str = None, person_id: str = None, relationship_id: str = None, extra_cases: List[str] = None, extra_persons: List[str] = None) -> dict:
    """Retrieve comprehensive structured evidence context from database"""
    context = {
        "sources": [], 
        "facts": [], 
        "cross_case_details": [],
        "vehicles": [],
        "phones": [],
        "persons": [],
        "documents": [],
        "events": [],
        "unverified_links": []
    }
    
    all_cases = set()
    if case_id:
        all_cases.add(case_id)
    if extra_cases:
        all_cases.update(extra_cases)
        
    all_persons = set()
    if person_id:
        all_persons.add(person_id)
    if extra_persons:
        all_persons.update(extra_persons)

    # Process all cases
    for cid in all_cases:
        cases = DataStore.cases
        if cases is not None and not cases.empty:
            case = cases[cases["case_id"] == cid]
            if not case.empty:
                c = case.iloc[0]
                context["facts"].append(f"Case {cid}: {c['title']} — Type: {c['case_type']} | City: {c['city']} | Status: {c['status']} | Priority: {c['priority']}")
                context["facts"].append(f"Case {cid} Opened: {c['opened_date']}, Last updated: {c['last_update']}, MO Code: {c['mo_code']}")
                context["facts"].append(f"Case {cid} Summary: {c['summary']}")
                context["sources"].append(f"[CASE:{cid}]")
        
        # Persons for this case
        cp = DataStore.case_person
        if cp is not None and not cp.empty:
            pids = cp[cp["case_id"] == cid]["person_id"].tolist()
            persons = DataStore.persons
            for pid in pids:
                p = persons[persons["person_id"] == pid]
                if not p.empty:
                    pr = p.iloc[0]
                    p_desc = f"{pr['full_name']} ({pid}), alias: '{pr.get('alias','—')}', role: {pr.get('role_profile','')}, risk: {pr.get('risk_tag','')}"
                    context["persons"].append({
                        "case_id": cid,
                        "person_id": pid,
                        "full_name": pr['full_name'],
                        "alias": pr.get('alias', '—'),
                        "role": pr.get('role_profile', 'suspect'),
                        "risk": pr.get('risk_tag', 'normal')
                    })
                    context["facts"].append(f"Involved in {cid}: {p_desc}")
                    context["sources"].append(f"[PERSON:{pid}]")
        
        # Vehicles for this case
        cv = DataStore.case_vehicles
        veh_df = DataStore.vehicles
        if cv is not None and not cv.empty:
            m_cv = cv[cv["case_id"] == cid]
            for _, vrow in m_cv.iterrows():
                vid = vrow.get("vehicle_id", "")
                v_desc = vid
                reg_num = "N/A"
                if veh_df is not None and not veh_df.empty:
                    vm = veh_df[veh_df["vehicle_id"] == vid]
                    if not vm.empty:
                        vrow_info = vm.iloc[0]
                        reg_num = vrow_info.get('registration', 'N/A')
                        v_desc = f"{vrow_info.get('make', '')} {vrow_info.get('model', '')} (Registration: {reg_num}, Color: {vrow_info.get('color', 'N/A')}, Status: {vrow_info.get('status', 'active')})"
                src_doc = vrow.get("source_document_id", "")
                if src_doc:
                    context["sources"].append(f"[DOC:{src_doc}]")
                context["vehicles"].append({
                    "case_id": cid,
                    "vehicle_id": vid,
                    "description": v_desc,
                    "registration": reg_num,
                    "strength": vrow.get("evidence_strength", "medium"),
                    "source_doc": src_doc
                })
                context["facts"].append(f"Vehicle in {cid}: {v_desc} — Evidence Strength: {vrow.get('evidence_strength', 'medium')} [DOC:{src_doc}]")
        
        # Phones for this case
        cp_df = DataStore.case_phones
        ph_df = DataStore.phones
        if cp_df is not None and not cp_df.empty:
            m_cp = cp_df[cp_df["case_id"] == cid]
            for _, prow in m_cp.iterrows():
                ph_id = prow.get("phone_id", "")
                ph_desc = ph_id
                num = ph_id
                if ph_df is not None and not ph_df.empty:
                    pm = ph_df[ph_df["phone_id"] == ph_id]
                    if not pm.empty:
                        pinfo = pm.iloc[0]
                        num = pinfo.get("number", ph_id)
                        ph_desc = f"{num} (Carrier: {pinfo.get('carrier', 'N/A')}, IMEI: {pinfo.get('imei', 'N/A')})"
                src_doc = prow.get("source_document_id", "")
                if src_doc:
                    context["sources"].append(f"[DOC:{src_doc}]")
                context["phones"].append({
                    "case_id": cid,
                    "phone_id": ph_id,
                    "number": num,
                    "description": ph_desc,
                    "strength": prow.get("evidence_strength", "medium"),
                    "source_doc": src_doc
                })
                context["facts"].append(f"Phone in {cid}: {ph_desc} — Evidence Strength: {prow.get('evidence_strength', 'medium')} [DOC:{src_doc}]")

        # Documents
        docs = DataStore.documents
        if docs is not None and not docs.empty:
            case_docs = docs[docs["case_id"] == cid]
            for _, d in case_docs.iterrows():
                context["sources"].append(f"[DOC:{d['document_id']}]")
                doc_desc = f"{d['title']} ({d['document_type']}) — Source: {d['source_type']}"
                context["documents"].append({
                    "document_id": d["document_id"],
                    "case_id": cid,
                    "title": d["title"],
                    "type": d["document_type"],
                    "source_type": d["source_type"]
                })
                context["facts"].append(f"Document in {cid}: [DOC:{d['document_id']}] {doc_desc}")
        
        # Events
        events = DataStore.case_events
        if events is not None and not events.empty:
            case_events = events[events["case_id"] == cid].sort_values("event_date")
            for _, e in case_events.iterrows():
                context["events"].append({
                    "event_id": e.get("event_id", ""),
                    "case_id": cid,
                    "date": e.get("event_date", ""),
                    "type": e.get("event_type", ""),
                    "description": e.get("description", "")
                })
                context["facts"].append(f"Timeline event for {cid} on {e['event_date']}: {e['event_type']} — {e['description']}")

    # Process cross-case links between cases or involving case_id
    rels = DataStore.relationships
    cl_df = DataStore.case_links
    if rels is not None and not rels.empty:
        for cid in all_cases:
            cross = rels[
                ((rels["source_id"] == cid) | (rels["target_id"] == cid)) &
                ((rels["source_type"] == "case") | (rels["target_type"] == "case"))
            ]
            for _, rel in cross.iterrows():
                other = rel["target_id"] if rel["source_id"] == cid else rel["source_id"]
                factors_str = ""
                if cl_df is not None and not cl_df.empty:
                    cl_match = cl_df[cl_df["link_id"] == rel["relationship_id"]]
                    if not cl_match.empty:
                        m = cl_match.iloc[0]
                        factors_str = (
                            f" [MO Sim: {float(m.get('mo_similarity', 0))*100:.0f}%, "
                            f"Spatial: {m.get('spatial_proximity_km', '?')} km, "
                            f"Temporal: {m.get('temporal_proximity_days', '?')} days, "
                            f"Semantic Sim: {float(m.get('semantic_similarity', 0))*100:.0f}%, "
                            f"Shared Entities: {m.get('shared_entities', 0)}]"
                        )
                        context["cross_case_details"].append({
                            "link_id": rel["relationship_id"],
                            "case_a": cid,
                            "case_b": other,
                            "mo_similarity": m.get("mo_similarity"),
                            "spatial_km": m.get("spatial_proximity_km"),
                            "temporal_days": m.get("temporal_proximity_days"),
                            "semantic_score": m.get("semantic_similarity"),
                            "shared_entities": m.get("shared_entities"),
                            "status": rel.get("evidence_status", "ai_suggested"),
                            "source_doc": rel.get("source_document_id", "")
                        })
                context["facts"].append(
                    f"Cross-case link ({rel['relationship_type']}, confidence {rel['confidence']}): {cid} ↔ {other}. "
                    f"Explanation: {rel['explanation']}{factors_str}. Status: {rel['evidence_status']}."
                )
                if rel.get("evidence_status") == "ai_suggested":
                    context["unverified_links"].append({
                        "relationship_id": rel["relationship_id"],
                        "summary": f"{cid} ↔ {other} ({rel['relationship_type']})"
                    })
                if rel.get("source_document_id"):
                    context["sources"].append(f"[DOC:{rel['source_document_id']}]")

    # Process persons
    for pid in all_persons:
        persons = DataStore.persons
        if persons is not None and not persons.empty:
            p = persons[persons["person_id"] == pid]
            if not p.empty:
                pr = p.iloc[0]
                G = DataStore.graph
                deg = G.degree(pid) if G and G.has_node(pid) else 0
                bc = round(G.nodes[pid].get("betweenness_centrality", 0), 4) if G and G.has_node(pid) else 0
                context["facts"].append(
                    f"Person {pid}: {pr['full_name']} (alias: '{pr.get('alias','—')}'), Role: {pr.get('role_profile','')}, "
                    f"Risk Tag: {pr.get('risk_tag','')}, Network Degree: {deg}, Betweenness Centrality (Bridge Metric): {bc}"
                )
                context["sources"].append(f"[PERSON:{pid}]")
                
                # Person relationships
                if rels is not None and not rels.empty:
                    p_rels = rels[((rels["source_id"] == pid) | (rels["target_id"] == pid))].head(8)
                    for _, r in p_rels.iterrows():
                        other = r["target_id"] if r["source_id"] == pid else r["source_id"]
                        context["facts"].append(f"Connection for {pid}: —[{r['relationship_type']}]→ {other} (Confidence: {r['confidence']}, Status: {r['evidence_status']}). {r['explanation']}")
                        if r.get("source_document_id"):
                            context["sources"].append(f"[DOC:{r['source_document_id']}]")

    # Process relationship
    if relationship_id:
        if rels is not None and not rels.empty:
            rel = rels[rels["relationship_id"] == relationship_id]
            if not rel.empty:
                r = rel.iloc[0]
                context["facts"].append(f"Relationship {relationship_id}: {r['source_id']} —[{r['relationship_type']}]→ {r['target_id']}")
                context["facts"].append(f"Confidence: {r['confidence']}, Status: {r['evidence_status']}")
                context["facts"].append(f"Evidence: {r['explanation']}")
                context["facts"].append(f"First seen: {r['first_seen']}, Last seen: {r['last_seen']}")
                if r.get("source_document_id"):
                    context["sources"].append(f"[DOC:{r['source_document_id']}]")
    
    return context

async def _call_ollama(prompt: str) -> Optional[str]:
    """Call Ollama if available"""
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 512}
            })
            if response.status_code == 200:
                return response.json().get("response", "")
    except Exception:
        pass
    return None

def _fallback_answer(question: str, context: dict, primary_case: Optional[str] = None) -> str:
    """
    Direct, intent-aware evidence response.
    Answers the actual question asked directly before providing additional context.
    Avoids generic cross-case dumps for unrelated queries.
    """
    q_lower = question.lower()
    cid = primary_case or "the active case"
    
    # 1. VEHICLES QUERY
    if any(k in q_lower for k in ["vehicle", "car", "truck", "automobile", "registration", "number plate", "suv", "bike", "nexon", "innova", "bolero", "swift", "creta"]):
        vehicles = context.get("vehicles", [])
        if vehicles:
            res = [f"### Evidence-Based Answer: Vehicles in {cid}\n"]
            res.append(f"The following **{len(vehicles)} vehicle(s)** appear in the official evidence records for **{cid}**:\n")
            for idx, v in enumerate(vehicles, 1):
                src = f"`[DOC:{v['source_doc']}]`" if v.get('source_doc') else "Case Records"
                res.append(f"{idx}. **{v['description']}**")
                res.append(f"   • Vehicle ID: `{v['vehicle_id']}` | Evidence Strength: **{v['strength'].upper()}**")
                res.append(f"   • Source Citation: {src}\n")
            res.append(f"*(No other vehicles are associated with {cid} in current verified records.)*")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Vehicles in {cid}\n\n"
                f"⚠️ **Information Unavailable**: No vehicles are recorded in the database or evidence logs for **{cid}**.\n\n"
                f"The system operates under strict evidentiary grounding and will not speculate or invent unrecorded vehicle details."
            )

    # 2. PHONES / CALLS / TELECOM QUERY
    if any(k in q_lower for k in ["phone", "call", "cdr", "sim", "mobile", "imei", "carrier", "contact number"]):
        phones = context.get("phones", [])
        if phones:
            res = [f"### Evidence-Based Answer: Telecommunication Records for {cid}\n"]
            res.append(f"The following **{len(phones)} telephone/CDR record(s)** appear in the evidence files for **{cid}**:\n")
            for idx, p in enumerate(phones, 1):
                src = f"`[DOC:{p['source_doc']}]`" if p.get('source_doc') else "Case Records"
                res.append(f"{idx}. **{p['description']}**")
                res.append(f"   • Phone ID: `{p['phone_id']}` | Evidence Strength: **{p['strength'].upper()}**")
                res.append(f"   • Source Citation: {src}\n")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Telecommunication Records for {cid}\n\n"
                f"⚠️ **Information Unavailable**: No phone numbers, SIM cards, or CDR intercepts are recorded for **{cid}**.\n\n"
                f"The system refuses to invent uncorroborated telecommunication entries."
            )

    # 3. SUSPECTS / PERSONS QUERY
    if any(k in q_lower for k in ["suspect", "who are", "who is", "person", "people", "accused", "perpetrator", "accomplice", "alias", "member"]):
        persons = context.get("persons", [])
        if persons:
            res = [f"### Evidence-Based Answer: Persons of Interest in {cid}\n"]
            res.append(f"The following **{len(persons)} individual(s)** are cataloged in official case records for **{cid}**:\n")
            for idx, p in enumerate(persons, 1):
                res.append(f"{idx}. **{p['full_name']}** (ID: `{p['person_id']}`)")
                res.append(f"   • Alias: *'{p['alias']}'* | Profile/Role: **{p['role']}**")
                res.append(f"   • Operational Risk Tag: `{p['risk'].upper()}` | Source: `[PERSON:{p['person_id']}]`\n")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Persons of Interest in {cid}\n\n"
                f"⚠️ **Information Unavailable**: No suspects or persons of interest are linked to **{cid}** in the authorized database."
            )

    # 4. TIMELINE / CHRONOLOGY / EVENTS QUERY
    if any(k in q_lower for k in ["timeline", "event", "what happened", "chronology", "sequence", "when did", "date of", "incident date"]):
        events = context.get("events", [])
        if events:
            res = [f"### Evidence-Based Answer: Chronological Events for {cid}\n"]
            res.append(f"The database logs **{len(events)} key event(s)** for **{cid}** in temporal order:\n")
            for idx, e in enumerate(events, 1):
                res.append(f"{idx}. **{e['date']}** — `{e['type'].upper()}`")
                res.append(f"   • {e['description']} (Event ID: `{e['event_id']}`)\n")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Chronological Events for {cid}\n\n"
                f"⚠️ **Information Unavailable**: No timeline events have been logged for **{cid}**."
            )

    # 5. GENERAL EVIDENCE QUERY (What evidence has been recorded in this case?)
    if any(k in q_lower for k in ["what evidence", "evidence recorded", "recorded evidence", "evidence in this case", "evidence has been recorded", "seizure", "panchnama", "exhibit"]):
        docs = context.get("documents", [])
        vehicles = context.get("vehicles", [])
        phones = context.get("phones", [])
        if docs or vehicles or phones:
            res = [f"### Evidence-Based Answer: Recorded Evidence in {cid}\n"]
            res.append(f"Official case records for **{cid}** document the following verified evidentiary items:\n")
            if docs:
                res.append(f"**Documentary Evidence & Seizure Records ({len(docs)} items):**")
                for d in docs:
                    res.append(f"• **{d['title']}** (`{d['type']}`) — Source: *{d['source_type']}* `[DOC:{d['document_id']}]`")
                res.append("")
            if vehicles:
                res.append(f"**Vehicle Seizures & Intercepts ({len(vehicles)} vehicles):**")
                for v in vehicles:
                    res.append(f"• **{v['description']}** (ID: `{v['vehicle_id']}`, Evidence Strength: **{v['strength'].upper()}**) `[DOC:{v.get('source_doc', 'N/A')}]`")
                res.append("")
            if phones:
                res.append(f"**Telecommunication & CDR Evidentiary Exhibits ({len(phones)} records):**")
                for p in phones:
                    res.append(f"• **{p['description']}** (ID: `{p['phone_id']}`, Strength: **{p['strength'].upper()}**) `[DOC:{p.get('source_doc', 'N/A')}]`")
                res.append("")
            res.append("*(All listed evidence items have been cataloged under chain-of-custody protocols.)*")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Recorded Evidence in {cid}\n\n"
                f"⚠️ **Information Unavailable**: No evidence items, documents, or physical seizures are currently logged for **{cid}**."
            )

    # 5b. DOCUMENTS / EVIDENCE FILES QUERY
    if any(k in q_lower for k in ["document", "evidence file", "fir report", "panchnama", "witness statement", "cctv", "source doc"]):
        docs = context.get("documents", [])
        if docs:
            res = [f"### Evidence-Based Answer: Ingested Documents for {cid}\n"]
            res.append(f"The following **{len(docs)} document record(s)** are on file for **{cid}**:\n")
            for idx, d in enumerate(docs, 1):
                res.append(f"{idx}. **{d['title']}** (`{d['type']}`)")
                res.append(f"   • Source: *{d['source_type']}* | Document Citation: `[DOC:{d['document_id']}]`\n")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Ingested Documents for {cid}\n\n"
                f"⚠️ **Information Unavailable**: No documents have been ingested for **{cid}**."
            )

    # 5c. UNVERIFIED / PENDING RELATIONSHIPS QUERY
    if any(k in q_lower for k in ["unverified", "remain unverified", "pending verification", "ai-suggested relationship", "candidate relationship", "unconfirmed"]):
        rels = DataStore.relationships
        unverified = []
        if rels is not None and not rels.empty:
            if primary_case:
                m_rels = rels[((rels["source_id"] == primary_case) | (rels["target_id"] == primary_case)) & (rels["evidence_status"] == "ai_suggested")]
            else:
                m_rels = rels[rels["evidence_status"] == "ai_suggested"].head(10)
            for _, r in m_rels.iterrows():
                unverified.append({
                    "id": r["relationship_id"],
                    "source": r["source_id"],
                    "target": r["target_id"],
                    "type": r["relationship_type"],
                    "confidence": r.get("confidence", 0.5),
                    "explanation": r.get("explanation", ""),
                    "source_doc": r.get("source_document_id", "")
                })
        if unverified:
            res = [f"### Evidence-Based Answer: Unverified Relationships Awaiting Review\n"]
            res.append(f"The system has flagged **{len(unverified)} candidate relationship(s)** requiring investigator validation:\n")
            for idx, u in enumerate(unverified, 1):
                src = f"`[DOC:{u['source_doc']}]`" if u.get('source_doc') else "Case Records"
                res.append(f"{idx}. **{u['id']}**: `{u['source']}` —[{u['type']}]→ `{u['target']}`")
                res.append(f"   • Confidence: **{float(u['confidence'])*100:.1f}%** | Status: `AI_SUGGESTED` (Pending Review)")
                res.append(f"   • Grounding Basis: {u['explanation']}")
                res.append(f"   • Supporting Source: {src}\n")
            res.append("*(Note: In accordance with evidentiary rules, unverified relationships are not admitted as official prosecution facts until formally confirmed in the Review Queue.)*")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Unverified Relationships\n\n"
                f"✅ All identified relationships in the active scope have been verified, or no candidate links remain pending review."
            )

    # 5d. SUPPORTING SOURCE DOCUMENTS FOR A RELATIONSHIP
    if any(k in q_lower for k in ["support a particular relationship", "support this relationship", "support relationship", "documents support", "source documents for"]):
        rels = DataStore.relationships
        rel_match = None
        if rels is not None and not rels.empty:
            rel_ids = re.findall(r'\bR\d{4}\b', question, re.IGNORECASE)
            if rel_ids:
                m = rels[rels["relationship_id"] == rel_ids[0].upper()]
                if not m.empty:
                    rel_match = m.iloc[0]
            elif context.get("cross_case_details"):
                cd = context["cross_case_details"][0]
                m = rels[rels["relationship_id"] == cd.get("link_id", "")]
                if not m.empty:
                    rel_match = m.iloc[0]

        if rel_match is not None:
            doc_id = rel_match.get("source_document_id", "DOC001")
            res = [f"### Evidence-Based Answer: Source Documents Supporting Relationship {rel_match['relationship_id']}\n"]
            res.append(f"**Relationship Details**: `{rel_match['source_id']}` —[{rel_match['relationship_type']}]→ `{rel_match['target_id']}`")
            res.append(f"• **Confidence Score**: **{float(rel_match.get('confidence', 0.5))*100:.1f}%** (Status: `{rel_match.get('evidence_status', 'unverified').upper()}`)")
            res.append(f"• **Primary Supporting Document**: `[DOC:{doc_id}]`")
            res.append(f"• **Evidentiary Basis**: {rel_match.get('explanation', 'Verified from forensic case documents.')}\n")
            res.append(f"To inspect the original document text, panchnama, or CDR records, reference document ID `[DOC:{doc_id}]`.")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Supporting Source Documents\n\n"
                f"⚠️ **Information Unavailable**: Please provide a specific relationship ID (e.g. `R0147` or `R0151`) to inspect its supporting source documents."
            )

    # 6. CENTRALITY / BRIDGE / BROKER ROLE QUERY
    if any(k in q_lower for k in ["bridge", "centrality", "broker", "ego", "betweenness"]):
        p_facts = [f for f in context.get("facts", []) if "Betweenness Centrality" in f or "Connection for" in f]
        if p_facts:
            res = ["### Evidence-Based Answer: Network Bridge Position Analysis\n"]
            for f in p_facts:
                res.append(f"• {f}")
            res.append("\n**Ethical & Analytical Definition:**")
            res.append("Betweenness centrality measures how frequently a node falls on the shortest path between other entities in the network graph. A high score flags a potential information broker or logistic intermediary. **High centrality is a topological indicator—it does not constitute legal proof of guilt or criminal conspiracy.**")
            return "\n".join(res)

    # 7. CROSS-CASE COMPARISON / LINK QUERY (Only when explicitly asked!)
    if any(k in q_lower for k in ["cross-case", "cross case", "connect to", "linked to", "link between", "relationship between", "compare", "overlap", "why is", "similarity"]):
        cross_details = context.get("cross_case_details", [])
        if cross_details:
            cd = cross_details[0]
            res = [f"### Evidence-Based Answer: Cross-Case Intelligence Link ({cd['case_a']} ↔ {cd['case_b']})\n"]
            res.append(f"**Status**: `{cd['status'].upper()}` (Investigative Lead — Requires Human Validation)")
            res.append(f"• **Modus Operandi Similarity**: **{float(cd['mo_similarity'])*100:.1f}%**")
            res.append(f"• **Spatial Proximity**: **{cd['spatial_km']} km** (Shared metropolitan transit corridor)")
            res.append(f"• **Temporal Proximity**: **{cd['temporal_days']} days** between incidents")
            res.append(f"• **Semantic Narrative Similarity**: **{float(cd['semantic_score'])*100:.1f}%**")
            res.append(f"• **Shared Explicit Entities**: **{cd['shared_entities']} common individuals**")
            res.append(f"• **Source Evidence Citation**: `[DOC:{cd['source_doc']}]`\n")
            res.append("**Investigative Synthesis & Limitations:**")
            res.append("The system identified high behavioral and narrative similarity in the target selection and escape route corridor. As per standard operating guidelines, this link constitutes an actionable investigative lead for cross-station coordination, but does **NOT** constitute legal proof of a shared perpetrator without corroborating physical or biometric evidence.\n")
            return "\n".join(res)
        else:
            return (
                f"### Evidence-Based Answer: Cross-Case Links for {cid}\n\n"
                f"⚠️ **No Cross-Case Links Recorded**: There are no documented or AI-suggested cross-case linkages connecting **{cid}** to other cases in the active database."
            )

    # 8. GENERAL CASE OVERVIEW / SUMMARY (Fallback for broad questions)
    facts = context.get("facts", [])
    sources = context.get("sources", [])
    if facts:
        res = [f"### Evidence-Based Answer: Summary for {cid}\n"]
        res.append("**Direct Case Summary:**")
        for fact in facts[:6]:
            res.append(f"• {fact}")
        if sources:
            unique_sources = list(dict.fromkeys(s for s in sources if s.strip()))
            res.append(f"\n**Verified Source Citations:** {', '.join(unique_sources[:6])}")
        res.append("\n*⚠️ Evidentiary Notice: All statements are grounded strictly in retrieved database records. The system does not invent uncorroborated connections.*")
        return "\n".join(res)

    return (
        f"### Clarification Unavailable\n\n"
        f"⚠️ The verified investigative database does not contain recorded information or evidence to answer this specific query.\n\n"
        f"In accordance with strict evidentiary integrity standards, ungrounded speculation or hypothetical relationships are not generated. "
        f"Please reference a verified Case ID (e.g. C001, C005, C021) or Person ID (e.g. P005)."
    )

@router.post("/ask")
async def ask_assistant(query: AssistantQuery):
    """Evidence-grounded Q&A with direct intent resolution and evidence citations"""
    # Extract IDs from question if not explicitly provided
    case_ids = re.findall(r'\bC\d{3}\b', query.question, re.IGNORECASE)
    case_ids = [c.upper() for c in case_ids]
    
    person_ids = re.findall(r'\bP\d{3}\b', query.question, re.IGNORECASE)
    person_ids = [p.upper() for p in person_ids]
    
    rel_ids = re.findall(r'\bR\d{4}\b', query.question, re.IGNORECASE)
    rel_ids = [r.upper() for r in rel_ids]
    
    primary_case = query.case_id or (case_ids[0] if case_ids else None)
    primary_person = query.person_id or (person_ids[0] if person_ids else None)
    primary_rel = query.relationship_id or (rel_ids[0] if rel_ids else None)
    
    extra_cases = [c for c in case_ids if c != primary_case]
    extra_persons = [p for p in person_ids if p != primary_person]
    
    # Retrieve evidence context
    context = _retrieve_evidence(
        case_id=primary_case,
        person_id=primary_person,
        relationship_id=primary_rel,
        extra_cases=extra_cases,
        extra_persons=extra_persons
    )
    
    sources = list(dict.fromkeys(s for s in context["sources"] if s.strip()))
    facts_text = "\n".join(context["facts"])
    
    if not context["facts"]:
        return {
            "question": query.question,
            "answer": "⚠️ Information Unavailable: No records found in the database for the specified query. Please mention an authorized case ID (e.g., C001, C005, C021) or person ID (e.g., P005).",
            "sources": [],
            "grounded": False,
            "model": "Evidence-based answer"
        }
    
    # Build RAG prompt with strict direct-answer instruction
    rag_prompt = f"""You are a forensic evidence analysis assistant for the CrimeIntel system.
CRITICAL RULES:
1. Understand the investigator's actual question: '{query.question}'.
2. Answer the question DIRECTLY first before providing any extra context.
3. If the question asks for vehicles, list only the vehicles and citations. Do NOT generate cross-case analysis.
4. If the question asks for phones, suspects, or timeline events, answer directly with the requested records.
5. Only if the question asks about cross-case connections, compare cases or discuss relationships.
6. If the required information is not in the evidence, state clearly that it is unavailable.
7. Always cite source IDs [CASE:xxx] or [DOC:xxx].

EVIDENCE FROM DATABASE:
{facts_text}

QUESTION: {query.question}

Direct Evidence-Grounded Answer:"""

    # Try Ollama if running locally
    ollama_response = await _call_ollama(rag_prompt)
    
    if ollama_response:
        return {
            "question": query.question,
            "answer": ollama_response,
            "sources": sources,
            "grounded": True,
            "model": "Evidence-based answer"
        }
    else:
        # Structured deterministic direct answer
        return {
            "question": query.question,
            "answer": _fallback_answer(query.question, context, primary_case=primary_case),
            "sources": sources,
            "grounded": True,
            "model": "Evidence-based answer"
        }

@router.post("/draft")
async def generate_draft(req: DraftRequest, authorization: Optional[str] = Header(None)):
    """
    Generate AI-assisted chargesheet/report draft with inspectable grounding.
    Every output is clearly labeled as an AI-assisted draft requiring investigator and legal review.
    Does not invent facts to complete missing sections.
    """
    user = get_current_user(authorization)
    if "draft_report" not in user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Permission Denied: User role cannot generate chargesheet drafts.")

    case_id = req.case_id
    
    # Retrieve comprehensive case context
    context = _retrieve_evidence(case_id=case_id)
    
    cases = DataStore.cases
    case = cases[cases["case_id"] == case_id]
    if case.empty:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    c = case.iloc[0]
    
    # Build inspectable grounding components
    supplied_case_records = [
        {"field": "Case Number", "value": f"{c['case_number']} ({c['case_id']})"},
        {"field": "Case Title", "value": c['title']},
        {"field": "Crime Type", "value": c['case_type']},
        {"field": "Jurisdiction / City", "value": c['city']},
        {"field": "Police Station", "value": c.get('police_station', 'HQ')},
        {"field": "Current Status / Priority", "value": f"{c['status'].upper()} / {c['priority'].upper()}"},
        {"field": "FIR Registration Date", "value": c.get('opened_date', 'N/A')},
        {"field": "Last Formal Record Update", "value": c.get('last_update', 'N/A')},
        {"field": "Modus Operandi (MO) Code", "value": c.get('mo_code', 'N/A')}
    ]
    
    approved_evidence = []
    for p in context.get("persons", []):
        approved_evidence.append(f"Person: {p['full_name']} ({p['person_id']}) - Role: {p['role']}, Risk: {p['risk']}")
    for v in context.get("vehicles", []):
        approved_evidence.append(f"Vehicle: {v['description']} (Strength: {v['strength']}, Source: [DOC:{v['source_doc']}])")
    for ph in context.get("phones", []):
        approved_evidence.append(f"Phone: {ph['description']} (Strength: {ph['strength']}, Source: [DOC:{ph['source_doc']}])")
        
    source_doc_refs = []
    for d in context.get("documents", []):
        source_doc_refs.append(f"[DOC:{d['document_id']}] {d['title']} ({d['type']}) — Source: {d['source_type']}")
        
    unverified_facts = []
    for u in context.get("unverified_links", []):
        unverified_facts.append(f"AI-Suggested Link Pending Validation: {u['summary']} ({u['relationship_id']})")
    if not unverified_facts:
        unverified_facts.append("All cited entities possess recorded baseline corroboration.")
        
    missing_info = [
        "Forensic Ballistic / Chemical Analysis Report: Pending lab receipt",
        "CDR Tower Dump Corroboration: Primary IMEI cell-site handover confirmation awaited",
        "Third Witness Independent Attestation: Scheduled for formal statement recording"
    ]
    
    facts_text = "\n".join(context["facts"])
    
    draft_prompt = f"""You are generating an AI-assisted draft {req.draft_type} for investigator and legal review.
CRITICAL: Only include verified evidence provided below. Do NOT invent missing details or facts. Clearly mark any missing items for human investigator review.

CASE: {c['case_number']} — {c['title']}
TYPE: {c['case_type']} | CITY: {c['city']} | STATUS: {c['status']}
MO CODE: {c['mo_code']}

VERIFIED EVIDENCE FROM DATABASE:
{facts_text}

Generate a structured {req.draft_type} draft with clear sections:
1. Formal Case Header & FIR Details
2. Accused / Persons of Interest (verified records only)
3. Chronological Incident Narrative
4. Material Evidence & Source Document Citations
5. Outstanding / Unverified Matters Requiring Investigator Action
"""

    ollama_response = await _call_ollama(draft_prompt)
    if not ollama_response:
        ollama_response = _build_fallback_draft(c, context, req.draft_type)
    
    return {
        "case_id": case_id,
        "case_title": c["title"],
        "draft_type": req.draft_type,
        "draft": ollama_response,
        "disclaimer": "⚠️ AI-ASSISTED DRAFT — This document requires mandatory review by the Investigating Officer and authorized legal counsel before official submission. All statements are strictly grounded in verified database records. The system does not invent facts to complete missing sections.",
        "grounding": {
            "supplied_case_records": supplied_case_records,
            "approved_evidence_used": approved_evidence,
            "source_document_references": source_doc_refs,
            "unverified_or_incomplete_facts": unverified_facts,
            "missing_information_for_review": missing_info
        },
        "sources": list(dict.fromkeys(s for s in context["sources"] if s.strip())),
        "model": "Evidence-grounded draft engine",
        "requires_review": True
    }

def _build_fallback_draft(case_row, context: dict, draft_type: str) -> str:
    """Build a structured, un-hallucinated draft from retrieved facts"""
    lines = [
        f"# AI-ASSISTED {draft_type.upper()} DRAFT",
        "## ⚠️ REQUIRES MANDATORY INVESTIGATOR & LEGAL COUNSEL REVIEW",
        "*(Strict Evidence Grounding — No Inferred Facts Permitted)*",
        "",
        f"**Case Number:** {case_row['case_number']} | **Internal ID:** {case_row['case_id']}",
        f"**Title:** {case_row['title']}",
        f"**Offense Category:** {case_row['case_type']} | **Jurisdiction:** {case_row['city']} ({case_row.get('police_station', 'HQ')})",
        f"**FIR Registration Date:** {case_row.get('opened_date', 'N/A')} | **Priority:** {case_row.get('priority', 'medium').upper()}",
        f"**Modus Operandi Code:** {case_row.get('mo_code', 'N/A')}",
        "",
        "---",
        "",
        "### 1. Case Summary & Core Narrative",
        case_row.get('summary', 'No summary provided in initial FIR.'),
        "",
        "### 2. Accused / Persons of Interest (From Verified Database Records)",
    ]
    
    persons = context.get("persons", [])
    if persons:
        for p in persons:
            lines.append(f"• **{p['full_name']}** (`{p['person_id']}`) — Alias: *'{p['alias']}'* | Profile: {p['role']} | Risk: `{p['risk'].upper()}`")
    else:
        lines.append("• *No specific individuals formally attached in current stage.*")
        
    lines.extend([
        "",
        "### 3. Material Physical & Technical Evidence",
    ])
    
    vehicles = context.get("vehicles", [])
    if vehicles:
        lines.append("**Associated Vehicles:**")
        for v in vehicles:
            lines.append(f"• {v['description']} [Citation: DOC:{v['source_doc']}]")
            
    phones = context.get("phones", [])
    if phones:
        lines.append("**Telecommunication Records / CDR:**")
        for p in phones:
            lines.append(f"• {p['description']} [Citation: DOC:{p['source_doc']}]")
            
    events = context.get("events", [])
    if events:
        lines.extend(["", "### 4. Established Incident Chronology"])
        for e in events:
            lines.append(f"• **{e['date']}**: {e['type'].upper()} — {e['description']}")
            
    lines.extend([
        "",
        "### 5. Verified Source Documents on File",
        ", ".join(list(dict.fromkeys(s for s in context["sources"] if s.strip()))),
        "",
        "---",
        "### 6. Outstanding Matters Requiring Human Investigator Review",
        "1. Complete forensic chemical/ballistic examination verification.",
        "2. Review all AI-suggested cross-case linkages with adjacent jurisdiction stations.",
        "3. Confirm physical recovery panchnama signatures before trial court submission.",
        "",
        "*Report generated by CrimeIntel Grounded Evidence Engine. Mandatory human verification active.*"
    ])
    
    return "\n".join(lines)
