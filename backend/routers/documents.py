"""Documents and entity extraction router"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from data_loader import DataStore
import re

router = APIRouter()

@router.get("/")
async def list_documents(
    case_id: Optional[str] = None,
    doc_type: Optional[str] = None,
    q: Optional[str] = None
):
    df = DataStore.documents.copy()
    if case_id:
        df = df[df["case_id"] == case_id]
    if doc_type:
        df = df[df["document_type"] == doc_type]
    if q:
        mask = df.apply(lambda row: q.lower() in row.to_string().lower(), axis=1)
        df = df[mask]
    return df.to_dict(orient="records")

@router.get("/{doc_id}")
async def get_document(doc_id: str):
    docs = DataStore.documents
    row = docs[docs["document_id"] == doc_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    
    doc = row.iloc[0].to_dict()
    
    # Get narrative text
    narr = DataStore.document_narratives
    if not narr.empty:
        narr_row = narr[narr["document_id"] == doc_id]
        if not narr_row.empty:
            doc["narrative_text"] = narr_row.iloc[0].get("text", "") or narr_row.iloc[0].get("narrative_text", "")
        else:
            doc["narrative_text"] = ""
    else:
        doc["narrative_text"] = ""
    
    return doc

@router.get("/{doc_id}/extract")
async def extract_entities(doc_id: str):
    """Extract entities from document narrative using regex patterns"""
    docs = DataStore.documents
    doc_row = docs[docs["document_id"] == doc_id]
    if doc_row.empty:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    
    narr = DataStore.document_narratives
    narrative = ""
    if not narr.empty:
        narr_row = narr[narr["document_id"] == doc_id]
        if not narr_row.empty:
            narrative = narr_row.iloc[0].get("text", "") or narr_row.iloc[0].get("narrative_text", "")
    
    if not narrative:
        return {
            "document_id": doc_id,
            "extracted_entities": [],
            "message": "No narrative text available for extraction"
        }
    
    extracted = _extract_entities_from_text(narrative, doc_id)
    
    return {
        "document_id": doc_id,
        "case_id": doc_row.iloc[0]["case_id"],
        "narrative_preview": narrative[:500] + "..." if len(narrative) > 500 else narrative,
        "extracted_entities": extracted
    }

def _extract_entities_from_text(text: str, doc_id: str) -> list:
    """Extract entities using pattern matching + cross-reference with known data"""
    entities = []
    
    persons = DataStore.persons
    phones = DataStore.phones
    vehicles = DataStore.vehicles
    
    # Match known person names
    if not persons.empty:
        for _, person in persons.iterrows():
            name = person["full_name"]
            alias = person.get("alias", "")
            
            if name.lower() in text.lower():
                entities.append({
                    "entity_type": "person",
                    "extracted_value": name,
                    "canonical_id": person["person_id"],
                    "canonical_label": name,
                    "match_method": "name_match",
                    "confidence": 0.95,
                    "in_source_doc": doc_id
                })
            elif alias and alias.lower() in text.lower():
                entities.append({
                    "entity_type": "person",
                    "extracted_value": alias,
                    "canonical_id": person["person_id"],
                    "canonical_label": name,
                    "match_method": "alias_match",
                    "confidence": 0.80,
                    "in_source_doc": doc_id
                })
    
    # Match phone patterns
    phone_pattern = re.compile(r'\b(?:9|8|7|6)\d{9}\b')
    found_phones = phone_pattern.findall(text)
    for ph in found_phones:
        matched_ph = None
        if not phones.empty:
            p = phones[phones.get("number", pd.Series([])) == ph] if "number" in phones.columns else pd.DataFrame()
            if not p.empty:
                matched_ph = p.iloc[0]["phone_id"]
        entities.append({
            "entity_type": "phone",
            "extracted_value": ph,
            "canonical_id": matched_ph,
            "canonical_label": ph,
            "match_method": "regex",
            "confidence": 0.90,
            "in_source_doc": doc_id
        })
    
    # Match vehicle registration pattern (Maharashtra format)
    vehicle_pattern = re.compile(r'\bMH[\s-]?\d{2}[\s-]?[A-Z]{1,2}[\s-]?\d{4}\b', re.IGNORECASE)
    found_vehicles = vehicle_pattern.findall(text)
    for veh in found_vehicles:
        entities.append({
            "entity_type": "vehicle",
            "extracted_value": veh,
            "canonical_id": None,
            "canonical_label": veh,
            "match_method": "regex",
            "confidence": 0.85,
            "in_source_doc": doc_id
        })
    
    # Match known locations
    locs = DataStore.locations
    if not locs.empty and "name" in locs.columns:
        for _, loc in locs.iterrows():
            if loc.get("name", "") and loc["name"].lower() in text.lower():
                entities.append({
                    "entity_type": "location",
                    "extracted_value": loc["name"],
                    "canonical_id": loc["location_id"],
                    "canonical_label": loc["name"],
                    "match_method": "name_match",
                    "confidence": 0.88,
                    "in_source_doc": doc_id
                })
    
    # Match known organizations
    orgs = DataStore.organizations
    if not orgs.empty and "name" in orgs.columns:
        for _, org in orgs.iterrows():
            if org.get("name", "") and org["name"].lower() in text.lower():
                entities.append({
                    "entity_type": "organization",
                    "extracted_value": org["name"],
                    "canonical_id": org["org_id"],
                    "canonical_label": org["name"],
                    "match_method": "name_match",
                    "confidence": 0.90,
                    "in_source_doc": doc_id
                })
    
    # Match known alias variants from entity_aliases
    aliases = DataStore.entity_aliases
    if aliases is not None and not aliases.empty:
        alias_col = "observed_value" if "observed_value" in aliases.columns else ("alias_value" if "alias_value" in aliases.columns else "")
        canon_col = "canonical_id" if "canonical_id" in aliases.columns else ("canonical_person_id" if "canonical_person_id" in aliases.columns else "")
        if alias_col and canon_col:
            for _, row in aliases.iterrows():
                obs = row.get(alias_col, "").strip()
                if obs and obs.lower() in text.lower():
                    pid = row.get(canon_col, "")
                    person = persons[persons["person_id"] == pid] if (persons is not None and not persons.empty) else None
                    name = person.iloc[0]["full_name"] if (person is not None and not person.empty) else pid
                    entities.append({
                        "entity_type": "person",
                        "extracted_value": obs,
                        "canonical_id": pid,
                        "canonical_label": name,
                        "match_method": "alias_resolution",
                        "confidence": 0.92,
                        "in_source_doc": doc_id
                    })

    # Deduplicate
    seen = set()
    unique = []
    for e in entities:
        key = (e["entity_type"], e["canonical_id"] or e["extracted_value"])
        if key not in seen:
            seen.add(key)
            unique.append(e)
    
    return unique

class ExtractTextRequest(pd.Series if False else object):
    pass

from pydantic import BaseModel
class ExtractTextPayload(BaseModel):
    text: str
    doc_id: Optional[str] = "INGESTED_DOC"
    case_id: Optional[str] = "C001"

@router.post("/extract-text")
async def extract_text_entities(payload: ExtractTextPayload):
    """Extract entities from custom or uploaded document text and infer candidate relationships"""
    extracted = _extract_entities_from_text(payload.text, payload.doc_id)
    
    # Infer candidate relationships between co-occurring entities
    candidate_relationships = []
    person_entities = [e for e in extracted if e["entity_type"] == "person"]
    phone_entities = [e for e in extracted if e["entity_type"] == "phone"]
    vehicle_entities = [e for e in extracted if e["entity_type"] == "vehicle"]
    org_entities = [e for e in extracted if e["entity_type"] == "organization"]
    
    # Person-to-Person associations
    for i in range(len(person_entities)):
        for j in range(i + 1, len(person_entities)):
            p1 = person_entities[i]
            p2 = person_entities[j]
            candidate_relationships.append({
                "source_id": p1["canonical_id"],
                "source_label": p1["canonical_label"],
                "target_id": p2["canonical_id"],
                "target_label": p2["canonical_label"],
                "relationship_type": "ASSOCIATE",
                "confidence": 0.88,
                "evidence_status": "ai_suggested",
                "explanation": f"Co-occurring persons in narrative {payload.doc_id}",
                "source_document_id": payload.doc_id
            })
            
    # Person-to-Phone associations
    for p in person_entities:
        for ph in phone_entities:
            candidate_relationships.append({
                "source_id": p["canonical_id"],
                "source_label": p["canonical_label"],
                "target_id": ph["canonical_id"] or ph["extracted_value"],
                "target_label": ph["extracted_value"],
                "relationship_type": "CALLS_OR_USES",
                "confidence": 0.85,
                "evidence_status": "ai_suggested",
                "explanation": f"Communication record co-occurrence in {payload.doc_id}",
                "source_document_id": payload.doc_id
            })
            
    # Person-to-Vehicle associations
    for p in person_entities:
        for v in vehicle_entities:
            candidate_relationships.append({
                "source_id": p["canonical_id"],
                "source_label": p["canonical_label"],
                "target_id": v["extracted_value"],
                "target_label": v["extracted_value"],
                "relationship_type": "OPERATES_VEHICLE",
                "confidence": 0.82,
                "evidence_status": "ai_suggested",
                "explanation": f"Vehicle sighted with person in {payload.doc_id}",
                "source_document_id": payload.doc_id
            })

    return {
        "document_id": payload.doc_id,
        "case_id": payload.case_id,
        "extracted_entities": extracted,
        "candidate_relationships": candidate_relationships,
        "entity_counts": {
            "total": len(extracted),
            "persons": len(person_entities),
            "phones": len(phone_entities),
            "vehicles": len(vehicle_entities),
            "organizations": len(org_entities),
            "locations": len([e for e in extracted if e["entity_type"] == "location"])
        }
    }

# Need pandas import for the function
import pandas as pd
