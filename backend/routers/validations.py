"""Validations router - human validation of AI-suggested relationships"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import datetime
from data_loader import DataStore

router = APIRouter()

class ValidationRequest(BaseModel):
    relationship_id: str
    action: str  # approved | rejected | needs_review
    comment: Optional[str] = ""
    reviewer_role: Optional[str] = "investigator"

@router.get("/")
async def list_validations(
    relationship_id: Optional[str] = None,
    action: Optional[str] = None
):
    df = DataStore.validations.copy()
    if relationship_id:
        df = df[df["relationship_id"] == relationship_id]
    if action:
        df = df[df["action"] == action]
    return df.to_dict(orient="records")

@router.post("/")
async def submit_validation(req: ValidationRequest, authorization: Optional[str] = Header(None)):
    """Submit human validation for an AI-suggested relationship"""
    if req.action not in ["approved", "rejected", "needs_review"]:
        raise HTTPException(status_code=400, detail="action must be approved | rejected | needs_review")
    
    # Find relationship
    rels = DataStore.relationships
    rel = rels[rels["relationship_id"] == req.relationship_id]
    if rel.empty:
        raise HTTPException(status_code=404, detail=f"Relationship {req.relationship_id} not found")
    
    # Update evidence_status in relationships
    idx = rels[rels["relationship_id"] == req.relationship_id].index[0]
    if req.action == "approved":
        DataStore.relationships.at[idx, "evidence_status"] = "verified"
    elif req.action == "rejected":
        DataStore.relationships.at[idx, "evidence_status"] = "rejected"
    else:
        DataStore.relationships.at[idx, "evidence_status"] = "needs_review"
    
    # Rebuild graph with updated data
    DataStore._build_graph()
    
    # Add to validations log
    user_id = "U001"  # Default fallback
    user_role = req.reviewer_role or "investigator"
    if authorization:
        token = authorization.replace("Bearer ", "")
        from routers.auth import DEMO_USERS
        for user in DEMO_USERS.values():
            if f"demo-token-{user['user_id']}" == token:
                user_id = user["user_id"]
                user_role = user.get("role", "investigator")
                break
                
    if user_role == "analyst":
        raise HTTPException(
            status_code=403, 
            detail="Permission Denied: Analysts possess read-only intelligence clearance. Evidence status validation requires an authorized Investigator or Administrator."
        )
    
    val_id = f"VAL{len(DataStore.validations) + 1:04d}"
    new_validation = {
        "validation_id": val_id,
        "relationship_id": req.relationship_id,
        "reviewer_role": req.reviewer_role,
        "action": req.action,
        "comment": req.comment,
        "validated_at": datetime.datetime.utcnow().date().isoformat()
    }
    
    import pandas as pd
    DataStore.validations = pd.concat([DataStore.validations, pd.DataFrame([new_validation])], ignore_index=True)
    
    # Audit
    DataStore.add_audit(user_id, f"VALIDATE_{req.action.upper()}", "relationship", req.relationship_id, req.comment)
    
    return {
        "success": True,
        "validation_id": val_id,
        "relationship_id": req.relationship_id,
        "new_status": DataStore.relationships.at[idx, "evidence_status"],
        "message": f"Relationship {req.relationship_id} marked as {req.action}"
    }

@router.get("/audit")
async def get_audit_log():
    """Return audit trail"""
    return DataStore.get_audit_log()

@router.get("/pending")
async def get_pending_validations():
    """Get AI-suggested relationships awaiting validation"""
    rels = DataStore.relationships
    pending = rels[rels["evidence_status"] == "ai_suggested"] if not rels.empty else rels
    
    result = []
    for _, rel in pending.iterrows():
        result.append({
            **rel.to_dict(),
            "requires_validation": True
        })
    return result
