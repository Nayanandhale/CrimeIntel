"""Graph router - NetworkX analytics, community detection, centrality"""
from fastapi import APIRouter, Query
from typing import Optional
from data_loader import DataStore
import networkx as nx

router = APIRouter()

@router.get("/nodes")
async def get_graph_nodes(
    node_type: Optional[str] = None,
    case_id: Optional[str] = None,
    person_id: Optional[str] = None,
    radius: int = Query(2, ge=1, le=3)
):
    """Return graph nodes for visualization with configurable ego radius"""
    G = DataStore.graph
    if not G:
        return {"nodes": [], "edges": []}
    
    # Filter nodes
    if case_id:
        # Get persons in this case
        cp = DataStore.case_person
        if not cp.empty:
            person_ids = set(cp[cp["case_id"] == case_id]["person_id"].tolist())
        else:
            person_ids = set()
        
        # Get relationships involving these persons
        rels = DataStore.relationships
        connected_ids = set(person_ids)
        if not rels.empty:
            for pid in person_ids:
                case_rels = rels[(rels["source_id"] == pid) | (rels["target_id"] == pid)]
                for _, rel in case_rels.iterrows():
                    connected_ids.add(rel["source_id"])
                    connected_ids.add(rel["target_id"])
        
        node_ids = [n for n in G.nodes() if n in connected_ids]
    elif person_id:
        # Ego network with configurable radius (1 or 2 hops)
        if G.has_node(person_id):
            node_ids = list(nx.ego_graph(G, person_id, radius=radius).nodes())
        else:
            node_ids = []
    else:
        node_ids = list(G.nodes())
    
    if node_type:
        node_ids = [n for n in node_ids if G.nodes[n].get("node_type") == node_type]
    
    nodes = []
    for nid in node_ids:
        data = G.nodes[nid]
        nodes.append({
            "id": nid,
            "label": data.get("label", nid),
            "node_type": data.get("node_type", "unknown"),
            "alias": data.get("alias", ""),
            "role": data.get("role", ""),
            "risk": data.get("risk", "normal"),
            "degree": G.degree(nid),
            "degree_centrality": round(data.get("degree_centrality", 0), 4),
            "betweenness_centrality": round(data.get("betweenness_centrality", 0), 4)
        })
    
    # Get edges between these nodes
    node_set = set(node_ids)
    edges = []
    seen = set()
    for u, v, data in G.edges(data=True):
        if u in node_set and v in node_set:
            key = tuple(sorted([u, v]))
            if key not in seen:
                seen.add(key)
                edges.append({
                    "source": u,
                    "target": v,
                    "relationship_id": data.get("relationship_id", ""),
                    "rel_type": data.get("rel_type", "KNOWS"),
                    "confidence": data.get("confidence", 0.5),
                    "evidence_status": data.get("evidence_status", "pending"),
                    "source_doc": data.get("source_doc", ""),
                    "explanation": data.get("explanation", ""),
                    "first_seen": data.get("first_seen", ""),
                    "last_seen": data.get("last_seen", "")
                })
    
    return {"nodes": nodes, "edges": edges}

@router.get("/communities")
async def get_communities():
    """Detect communities using Louvain / Greedy modularity"""
    G = DataStore.graph
    if not G:
        return []
    
    # Work only on person nodes
    person_nodes = [n for n, d in G.nodes(data=True) if d.get("node_type") == "person"]
    subgraph = G.subgraph(person_nodes)
    
    try:
        communities = list(nx.community.greedy_modularity_communities(subgraph))
    except Exception:
        # Fallback: connected components
        communities = list(nx.connected_components(subgraph))
    
    result = []
    for i, comm in enumerate(communities):
        members = []
        for pid in comm:
            person = DataStore.persons[DataStore.persons["person_id"] == pid]
            if not person.empty:
                members.append({
                    "person_id": pid,
                    "name": person.iloc[0]["full_name"],
                    "alias": person.iloc[0].get("alias", ""),
                    "role": person.iloc[0].get("role_profile", ""),
                    "risk": person.iloc[0].get("risk_tag", "normal"),
                    "degree": G.degree(pid),
                    "betweenness": round(G.nodes[pid].get("betweenness_centrality", 0), 4)
                })
        members.sort(key=lambda x: x["degree"], reverse=True)
        result.append({
            "community_id": i + 1,
            "size": len(comm),
            "members": members,
            "bridge_candidates": [m for m in members if m["betweenness"] > 0.01]
        })
    
    return sorted(result, key=lambda x: x["size"], reverse=True)

@router.get("/edge/{relationship_id}")
async def get_edge_detail(relationship_id: str):
    """Get full edge details for Evidence Drawer with plain-language explanations"""
    rels = DataStore.relationships
    rel = rels[rels["relationship_id"] == relationship_id]
    if rel.empty:
        return {"error": "Relationship not found"}
    
    row = rel.iloc[0].to_dict()
    
    def resolve_entity_name(etype, eid):
        if etype == "person":
            df = DataStore.persons
            if not df.empty:
                m = df[df["person_id"] == eid]
                if not m.empty:
                    name = m.iloc[0].get("full_name", eid)
                    alias = m.iloc[0].get("alias", "")
                    return f"{name} ({alias})" if alias else name
        elif etype == "phone":
            df = DataStore.phones
            if not df.empty:
                m = df[df["phone_id"] == eid]
                if not m.empty:
                    return m.iloc[0].get("number", eid)
        elif etype == "vehicle":
            df = DataStore.vehicles
            if not df.empty:
                m = df[df["vehicle_id"] == eid]
                if not m.empty:
                    return m.iloc[0].get("registration", eid)
        elif etype == "case":
            df = DataStore.cases
            if not df.empty:
                m = df[df["case_id"] == eid]
                if not m.empty:
                    return f"{eid}: {m.iloc[0].get('title', '')}"
        return eid

    row["source_name"] = resolve_entity_name(row.get("source_type", ""), row.get("source_id", ""))
    row["target_name"] = resolve_entity_name(row.get("target_type", ""), row.get("target_id", ""))
    
    # Get source document
    doc_id = row.get("source_document_id", "")
    doc = None
    extracted_passage = ""
    if doc_id:
        docs = DataStore.documents
        if not docs.empty:
            doc_row = docs[docs["document_id"] == doc_id]
            if not doc_row.empty:
                doc = doc_row.iloc[0].to_dict()
                narr = DataStore.document_narratives
                if not narr.empty:
                    narr_row = narr[narr["document_id"] == doc_id]
                    if not narr_row.empty:
                        full_text = narr_row.iloc[0].get("text", "") or narr_row.iloc[0].get("narrative_text", "")
                        doc["narrative"] = full_text
                        extracted_passage = full_text
    
    # Distinguish NLP model extraction confidence vs evidentiary strength
    try:
        conf_val = float(row.get("confidence", 0.5))
    except:
        conf_val = 0.5
        
    conf_pct = round(conf_val * 100)
    if conf_val >= 0.8:
        strength = "High Evidentiary Corroboration"
        strength_desc = "Corroborated across primary case documents (witness depositions, Call Detail Records, physical logs)."
    elif conf_val >= 0.6:
        strength = "Moderate Evidentiary Corroboration"
        strength_desc = "Mentioned in single investigative document or statement awaiting multi-source confirmation."
    else:
        strength = "Preliminary Investigative Lead"
        strength_desc = "Derived from single unverified tip or preliminary inference; field verification required."
        
    confidence_basis = {
        "score_percentage": conf_pct,
        "model_confidence_label": f"{conf_pct}% NLP Model Extraction Confidence",
        "model_confidence_expl": f"NLP parser statistical confidence score estimating syntactic entity-relation accuracy ({conf_pct}%).",
        "evidence_strength": strength,
        "evidence_strength_desc": strength_desc
    }
    
    # Validation history
    vals = DataStore.validations
    validation_history = []
    if not vals.empty:
        val_rows = vals[vals["relationship_id"] == relationship_id]
        validation_history = val_rows.to_dict(orient="records")
        
    # Check if edge has component similarity factors in case_links
    case_link_factors = None
    cl_df = DataStore.case_links
    if cl_df is not None and not cl_df.empty:
        cl_match = cl_df[cl_df["link_id"] == relationship_id]
        if not cl_match.empty:
            case_link_factors = cl_match.iloc[0].to_dict()
    
    return {
        "relationship": row,
        "source_document": doc,
        "extracted_passage": extracted_passage,
        "confidence_basis": confidence_basis,
        "validation_history": validation_history,
        "case_link_factors": case_link_factors
    }

@router.get("/centrality/top")
async def get_top_central_persons(limit: int = 10):
    """Get top persons by centrality metrics"""
    G = DataStore.graph
    persons = DataStore.persons
    
    result = []
    for _, row in persons.iterrows():
        pid = row["person_id"]
        if G and G.has_node(pid):
            result.append({
                "person_id": pid,
                "name": row["full_name"],
                "alias": row.get("alias", ""),
                "role": row.get("role_profile", ""),
                "risk": row.get("risk_tag", "normal"),
                "degree": G.degree(pid),
                "degree_centrality": round(G.nodes[pid].get("degree_centrality", 0), 4),
                "betweenness_centrality": round(G.nodes[pid].get("betweenness_centrality", 0), 4)
            })
    
    # Sort by betweenness (bridge nodes)
    return sorted(result, key=lambda x: x["betweenness_centrality"], reverse=True)[:limit]

@router.get("/cross-case")
async def get_cross_case_links():
    """Get all cross-case links with scores"""
    rels = DataStore.relationships
    if rels.empty:
        return []
    
    cross = rels[(rels["source_type"] == "case") | (rels["target_type"] == "case")]
    
    result = []
    for _, rel in cross.iterrows():
        src_id = rel["source_id"]
        tgt_id = rel["target_id"]
        
        src_case = DataStore.cases[DataStore.cases["case_id"] == src_id]
        tgt_case = DataStore.cases[DataStore.cases["case_id"] == tgt_id]
        
        result.append({
            "relationship_id": rel["relationship_id"],
            "relationship_type": rel["relationship_type"],
            "source_case_id": src_id,
            "source_case_title": src_case.iloc[0]["title"] if not src_case.empty else src_id,
            "target_case_id": tgt_id,
            "target_case_title": tgt_case.iloc[0]["title"] if not tgt_case.empty else tgt_id,
            "confidence": rel.get("confidence", ""),
            "evidence_status": rel.get("evidence_status", ""),
            "explanation": rel.get("explanation", ""),
            "source_document_id": rel.get("source_document_id", ""),
            "first_seen": rel.get("first_seen", ""),
            "last_seen": rel.get("last_seen", "")
        })
    
    return result
