"""Persons router with entity resolution"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from rapidfuzz import fuzz, process
import re
import pandas as pd
from data_loader import DataStore

router = APIRouter()

@router.get("/")
async def list_persons(
    role: Optional[str] = None,
    risk: Optional[str] = None,
    q: Optional[str] = None
):
    df = DataStore.persons.copy()
    if role:
        df = df[df["role_profile"] == role]
    if risk:
        df = df[df["risk_tag"] == risk]
    if q:
        mask = df.apply(lambda row: q.lower() in row.to_string().lower(), axis=1)
        df = df[mask]
    
    result = []
    for _, row in df.iterrows():
        pid = row["person_id"]
        G = DataStore.graph
        degree = G.degree(pid) if G and G.has_node(pid) else 0
        centrality = G.nodes[pid].get("betweenness_centrality", 0) if G and G.has_node(pid) else 0
        result.append({
            **row.to_dict(),
            "degree": degree,
            "betweenness_centrality": round(centrality, 4)
        })
    
    return sorted(result, key=lambda x: x["degree"], reverse=True)

@router.get("/resolve")
async def resolve_entity(q: str = Query(..., description="Observed name/alias to resolve")):
    """Entity resolution - find canonical person from alias/variant"""
    persons = DataStore.persons
    
    candidates = []
    
    # Direct match
    direct = persons[persons["full_name"].str.lower() == q.lower()]
    if not direct.empty:
        for _, row in direct.iterrows():
            candidates.append({"person_id": row["person_id"], "full_name": row["full_name"],
                              "alias": row["alias"], "match_type": "exact", "confidence": 1.0})
    
    # Alias match
    alias_match = persons[persons["alias"].str.lower() == q.lower()]
    if not alias_match.empty:
        for _, row in alias_match.iterrows():
            candidates.append({"person_id": row["person_id"], "full_name": row["full_name"],
                              "alias": row["alias"], "match_type": "alias_match", "confidence": 0.95})
    
    # Fuzzy match on full_name
    names = persons["full_name"].tolist()
    fuzzy_results = process.extract(q, names, scorer=fuzz.token_sort_ratio, limit=5)
    for name, score, idx in fuzzy_results:
        if score >= 60:
            person = persons.iloc[idx]
            if not any(c["person_id"] == person["person_id"] for c in candidates):
                candidates.append({
                    "person_id": person["person_id"],
                    "full_name": person["full_name"],
                    "alias": person["alias"],
                    "match_type": "fuzzy",
                    "confidence": round(score / 100, 2)
                })
    
    # Check entity_aliases table
    aliases = DataStore.entity_aliases
    if not aliases.empty:
        alias_col = "observed_value" if "observed_value" in aliases.columns else ("alias_value" if "alias_value" in aliases.columns else "")
        canon_col = "canonical_id" if "canonical_id" in aliases.columns else ("canonical_person_id" if "canonical_person_id" in aliases.columns else "")
        if alias_col and canon_col:
            clean_q = q.lower().strip()
            exact_matches = aliases[aliases[alias_col].str.lower() == clean_q]
            contains_matches = aliases[aliases[alias_col].str.lower().str.contains(re.escape(clean_q.strip('.')), na=False)]
            alias_rows = pd.concat([exact_matches, contains_matches]).drop_duplicates(subset=[canon_col, alias_col])
            
            for _, row in alias_rows.iterrows():
                pid = row.get(canon_col, "")
                if pid:
                    person = persons[persons["person_id"] == pid]
                    if not person.empty:
                        conf_val = row.get("confidence", "high")
                        conf_num = 0.98 if row[alias_col].lower() == clean_q else (0.90 if conf_val == "high" else (0.80 if conf_val == "medium" else 0.70))
                        
                        # Collect all alternate aliases for this canonical person
                        all_p_aliases = aliases[aliases[canon_col] == pid][alias_col].tolist()
                        
                        # Find existing candidate or add
                        existing = next((c for c in candidates if c["person_id"] == pid), None)
                        if existing:
                            existing["confidence"] = max(existing["confidence"], conf_num)
                            existing["observed_alias"] = row.get(alias_col, q)
                            existing["alternate_names"] = list(set(existing.get("alternate_names", []) + all_p_aliases))
                        else:
                            candidates.append({
                                "person_id": pid,
                                "full_name": person.iloc[0]["full_name"],
                                "alias": person.iloc[0].get("alias", ""),
                                "observed_alias": row.get(alias_col, q),
                                "alternate_names": all_p_aliases,
                                "match_type": "entity_alias_table" if row[alias_col].lower() == clean_q else "alias_variant",
                                "confidence": conf_num
                            })
    
    # Sort candidates by confidence
    candidates.sort(key=lambda x: x["confidence"], reverse=True)
    return {"query": q, "candidates": candidates}

@router.get("/{person_id}")
async def get_person(person_id: str):
    df = DataStore.persons
    row = df[df["person_id"] == person_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    
    person = row.iloc[0].to_dict()
    
    # Graph metrics
    G = DataStore.graph
    if G and G.has_node(person_id):
        person["degree"] = G.degree(person_id)
        person["degree_centrality"] = round(G.nodes[person_id].get("degree_centrality", 0), 4)
        person["betweenness_centrality"] = round(G.nodes[person_id].get("betweenness_centrality", 0), 4)
        
        # Neighbors
        neighbors = []
        for nb_id in G.neighbors(person_id):
            nb_data = G.nodes[nb_id]
            edge_data = G.get_edge_data(person_id, nb_id)
            neighbors.append({
                "id": nb_id,
                "label": nb_data.get("label", nb_id),
                "node_type": nb_data.get("node_type", "unknown"),
                "relationship": edge_data
            })
        person["neighbors"] = neighbors
    
    # Cases this person appears in
    cp = DataStore.case_person
    if not cp.empty:
        case_ids = cp[cp["person_id"] == person_id]["case_id"].tolist()
        cases_df = DataStore.cases
        person["cases"] = cases_df[cases_df["case_id"].isin(case_ids)].to_dict(orient="records") if not cases_df.empty else []
    else:
        person["cases"] = []
    
    # Aliases
    aliases = DataStore.entity_aliases
    if not aliases.empty:
        canon_col = "canonical_id" if "canonical_id" in aliases.columns else ("canonical_person_id" if "canonical_person_id" in aliases.columns else "")
        if canon_col:
            person_aliases = aliases[aliases[canon_col] == person_id]
            person["known_aliases"] = person_aliases.to_dict(orient="records")
        else:
            person["known_aliases"] = []
    else:
        person["known_aliases"] = []
    
    return person

@router.get("/{person_id}/relationships")
async def get_person_relationships(person_id: str):
    rels = DataStore.relationships
    if rels.empty:
        return []
    
    person_rels = rels[
        ((rels["source_type"] == "person") & (rels["source_id"] == person_id)) |
        ((rels["target_type"] == "person") & (rels["target_id"] == person_id))
    ]
    
    result = []
    for _, rel in person_rels.iterrows():
        other_id = rel["target_id"] if rel["source_id"] == person_id else rel["source_id"]
        other_type = rel["target_type"] if rel["source_id"] == person_id else rel["source_type"]
        
        # Get label for other node
        other_label = other_id
        if other_type == "person":
            p = DataStore.persons[DataStore.persons["person_id"] == other_id]
            if not p.empty:
                other_label = p.iloc[0]["full_name"]
        elif other_type == "phone":
            ph = DataStore.phones[DataStore.phones["phone_id"] == other_id] if not DataStore.phones.empty else None
            if ph is not None and not ph.empty:
                other_label = ph.iloc[0].get("number", other_id)
        
        # Validation
        vals = DataStore.validations
        validation = None
        if not vals.empty:
            val = vals[vals["relationship_id"] == rel["relationship_id"]]
            if not val.empty:
                validation = val.iloc[0].to_dict()
        
        result.append({
            **rel.to_dict(),
            "other_id": other_id,
            "other_type": other_type,
            "other_label": other_label,
            "validation": validation
        })
    
    return result
