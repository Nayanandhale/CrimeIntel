"""
CrimeIntel - AI-Powered Criminal Network Analysis System
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
import os
import json
from pathlib import Path

from routers import cases, persons, graph, documents, alerts, validations, auth, assistant, analytics
from data_loader import DataStore

app = FastAPI(
    title="CrimeIntel API",
    description="AI-Powered Criminal Network Analysis System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize data store on startup
@app.on_event("startup")
async def startup_event():
    DataStore.load_all()

# Mount static frontend
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
    css_path = frontend_path / "css"
    if css_path.exists():
        app.mount("/css", StaticFiles(directory=str(css_path)), name="css")
    js_path = frontend_path / "js"
    if js_path.exists():
        app.mount("/js", StaticFiles(directory=str(js_path)), name="js")

@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return HTMLResponse("<h1>CrimeIntel API Running - Open /api/docs</h1>")

@app.get("/crimeintel-logo.svg")
async def get_svg_logo():
    logo_path = frontend_path / "crimeintel-logo.svg"
    if logo_path.exists():
        return FileResponse(str(logo_path), media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="SVG Logo not found")

@app.get("/CrimeIntel_logo.png")
async def get_logo():
    logo_path = frontend_path / "CrimeIntel_logo.png"
    if not logo_path.exists():
        logo_path = Path(__file__).parent.parent / "CrimeIntel_logo.png"
    if logo_path.exists():
        return FileResponse(str(logo_path), media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(cases.router, prefix="/api/cases", tags=["Cases"])
app.include_router(persons.router, prefix="/api/persons", tags=["Persons"])
app.include_router(graph.router, prefix="/api/graph", tags=["Graph"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(validations.router, prefix="/api/validations", tags=["Validations"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["AI Assistant"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "CrimeIntel", "note": "Synthetic demo data - no real criminal records"}
