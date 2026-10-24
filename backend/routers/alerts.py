"""Alerts router - Authorized system-wide alerts across cases"""
from fastapi import APIRouter, Query, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
import datetime
from data_loader import DataStore

router = APIRouter()

class AlertStatusUpdate(BaseModel):
    status: str  # open | in_review | dismissed

@router.get("/")
async def list_alerts(
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    status: Optional[str] = None,
    case_id: Optional[str] = None
):
    df = DataStore.alerts.copy()
    if df is None or df.empty:
        return []
        
    if severity and severity != "all":
        df = df[df["severity"] == severity]
    if alert_type and alert_type != "all":
        df = df[df["alert_type"] == alert_type]
    if status and status != "all":
        df = df[df["status"] == status]
    if case_id and case_id != "all":
        df = df[df["case_id"] == case_id]
    
    cases_df = DataStore.cases
    result = []
    
    for _, row in df.iterrows():
        cid = row.get("case_id", "")
        case_info = {"title": "", "status": "", "city": "", "case_number": cid, "last_update": "2026-03-15"}
        if cases_df is not None and not cases_df.empty:
            c = cases_df[cases_df["case_id"] == cid]
            if not c.empty:
                cr = c.iloc[0]
                case_info = {
                    "title": cr["title"],
                    "status": cr["status"],
                    "city": cr["city"],
                    "case_number": cr["case_number"],
                    "last_update": cr.get("last_update", "2026-03-15")
                }
        
        # Associated entity or focal subject
        atype = row.get("alert_type", "notice")
        assoc_entity = f"Case {cid}"
        if atype == "new_cross_case_link":
            assoc_entity = f"Case {cid} ↔ Adjacent Station Lead"
        elif atype == "missing_update":
            assoc_entity = f"Case {cid} (Evidentiary Deficiency)"
        elif atype == "aging_case":
            assoc_entity = f"Case {cid} (Statutory Filing Clock)"
        elif atype == "pending_validation":
            assoc_entity = f"Case {cid} (AI-Suggested Link Queue)"
            
        result.append({
            "alert_id": row.get("alert_id", ""),
            "case_id": cid,
            "case_number": case_info["case_number"],
            "case_title": case_info["title"],
            "case_status": case_info["status"],
            "case_city": case_info["city"],
            "associated_entity": assoc_entity,
            "alert_type": atype,
            "severity": row.get("severity", "medium"),
            "reason": row.get("message", "Investigative alert triggered by system audit."),
            "created_at": case_info["last_update"],
            "status": row.get("status", "open"),
            "action_text": "Open Case Workspace"
        })
    
    # Sort order: critical first, then high, then medium, then low
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    result.sort(key=lambda x: sev_rank.get(x["severity"], 9))
    return result

@router.patch("/{alert_id}/status")
async def update_alert_status(alert_id: str, req: AlertStatusUpdate):
    if req.status not in ["open", "in_review", "dismissed"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be open, in_review, or dismissed.")
    
    df = DataStore.alerts
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No alerts found")
        
    idx = df[df["alert_id"] == alert_id].index
    if len(idx) == 0:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
    DataStore.alerts.at[idx[0], "status"] = req.status
    return {"status": "success", "alert_id": alert_id, "new_status": req.status}

@router.get("/summary")
async def alert_summary():
    alerts = DataStore.alerts
    if alerts is None or alerts.empty:
        return {"total": 0, "critical": 0, "high": 0, "by_severity": {}, "by_type": {}}
    
    return {
        "total": len(alerts),
        "by_severity": alerts["severity"].value_counts().to_dict(),
        "by_type": alerts["alert_type"].value_counts().to_dict(),
        "critical": len(alerts[alerts["severity"] == "critical"]),
        "high": len(alerts[alerts["severity"] == "high"]),
        "open": len(alerts[alerts["status"] == "open"])
    }
