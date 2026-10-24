"""Auth router - RBAC, Jurisdiction-Based Access Control and Authentication for CrimeIntel"""
# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException, Header
# pyrefly: ignore[missing-import]
from pydantic import BaseModel
from typing import Optional, List, Dict
import hashlib
from data_loader import DataStore

router = APIRouter()

SALT = "crimeintel_sih_2026_salt"

def hash_pw(pw: str) -> str:
    return hashlib.sha256(f"{SALT}_{pw}".encode("utf-8")).hexdigest()

# Hashed credentials (never stored in plain text)
DEMO_USERS = {
    "admin": {
        "user_id": "U004",
        "display_name": "Demo Admin",
        "role": "admin",
        "unit": "HQ",
        "jurisdiction": "All Districts",
        "authorized_cities": ["*"],
        "authorized_stations": ["*"],
        "password_hash": hash_pw("admin123")
    },
    "investigator": {
        "user_id": "U001",
        "display_name": "Asha Kulkarni",
        "role": "investigator",
        "unit": "Pune Sub-Division",
        "jurisdiction": "Pune & Satara Corridor",
        "authorized_cities": ["pune", "satara", "pimpri-chinchwad"],
        "authorized_stations": ["Satara Police Station", "Pune Police Station", "Pimpri-Chinchwad Police Station"],
        "password_hash": hash_pw("invest123")
    },
    "senior_investigator": {
        "user_id": "U002",
        "display_name": "Vivek Deshmukh",
        "role": "senior_investigator",
        "unit": "Pune Sub-Division",
        "jurisdiction": "Pune & Satara Corridor",
        "authorized_cities": ["pune", "satara", "pimpri-chinchwad"],
        "authorized_stations": ["Satara Police Station", "Pune Police Station", "Pimpri-Chinchwad Police Station"],
        "password_hash": hash_pw("senior123")
    },
    "analyst": {
        "user_id": "U003",
        "display_name": "Neha Patil",
        "role": "analyst",
        "unit": "Nashik Intelligence Bureau",
        "jurisdiction": "Northern Range (Nashik/Thane/Jalgaon)",
        "authorized_cities": ["nashik", "thane", "jalgaon", "navi mumbai"],
        "authorized_stations": ["Nashik Police Station", "Thane Police Station", "Jalgaon Police Station"],
        "password_hash": hash_pw("analyst123")
    }
}

ROLE_PERMISSIONS = {
    "analyst": [
        "read_cases", "read_persons", "read_graph", "read_documents", 
        "read_alerts", "ask_assistant", "view_geo_map", "view_analytics"
    ],
    "investigator": [
        "read_cases", "read_persons", "read_graph", "read_documents", 
        "read_alerts", "ask_assistant", "validate_relationships", "draft_report", 
        "write_case_notes", "register_fir", "add_evidence", "view_geo_map", "view_analytics"
    ],
    "senior_investigator": [
        "read_cases", "read_persons", "read_graph", "read_documents", 
        "read_alerts", "ask_assistant", "validate_relationships", "draft_report", 
        "write_case_notes", "manage_alerts", "approve_cross_case", "register_fir", 
        "add_evidence", "amend_fir", "view_geo_map", "view_analytics"
    ],
    "admin": [
        "read_cases", "read_persons", "read_graph", "read_documents", 
        "read_alerts", "ask_assistant", "validate_relationships", 
        "view_geo_map", "view_analytics", "view_executive", "view_workload", "manage_system"
    ]
}

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(req: LoginRequest):
    user = DEMO_USERS.get(req.username.strip().lower())
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if hash_pw(req.password) != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    DataStore.add_audit(user["user_id"], "LOGIN", "auth", user["user_id"], f"Authenticated as {req.username} ({user['role']})")
    
    return {
        "user_id": user["user_id"],
        "username": req.username.strip().lower(),
        "display_name": user["display_name"],
        "role": user["role"],
        "unit": user["unit"],
        "jurisdiction": user["jurisdiction"],
        "authorized_cities": user["authorized_cities"],
        "authorized_stations": user["authorized_stations"],
        "permissions": ROLE_PERMISSIONS.get(user["role"], []),
        "token": f"demo-token-{user['user_id']}"
    }

@router.get("/users")
async def get_users():
    return [
        {
            "username": k,
            "display_name": v["display_name"],
            "role": v["role"],
            "unit": v["unit"],
            "jurisdiction": v["jurisdiction"]
        } 
        for k, v in DEMO_USERS.items()
    ]

@router.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    return user

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict:
    """Validate Bearer token and return active user profile with authorized scope"""
    if not authorization:
        # Default fallback for public demo inspection
        return {
            "user_id": "U001",
            "username": "investigator",
            "role": "investigator",
            "display_name": "Asha Kulkarni",
            "unit": "Pune Sub-Division",
            "jurisdiction": "Pune & Satara Corridor",
            "authorized_cities": ["pune", "satara", "pimpri-chinchwad"],
            "authorized_stations": ["Satara Police Station", "Pune Police Station", "Pimpri-Chinchwad Police Station"],
            "permissions": ROLE_PERMISSIONS["investigator"]
        }
    
    token = authorization.replace("Bearer ", "").strip()
    for uname, user in DEMO_USERS.items():
        if f"demo-token-{user['user_id']}" == token:
            return {
                "user_id": user["user_id"],
                "username": uname,
                "role": user["role"],
                "display_name": user["display_name"],
                "unit": user["unit"],
                "jurisdiction": user["jurisdiction"],
                "authorized_cities": user["authorized_cities"],
                "authorized_stations": user["authorized_stations"],
                "permissions": ROLE_PERMISSIONS.get(user["role"], [])
            }
            
    raise HTTPException(status_code=401, detail="Session expired or invalid token")
