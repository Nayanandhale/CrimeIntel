"""
Data Store - Loads all CSV data into memory for the CrimeIntel prototype.
In production, this would use PostgreSQL + pgvector.
"""

import pandas as pd
import networkx as nx
from pathlib import Path
from typing import Dict, List, Optional
import json

DB_PATH = Path(__file__).parent.parent / "sample_database"


class DataStore:
    cases: pd.DataFrame = None
    persons: pd.DataFrame = None
    documents: pd.DataFrame = None
    relationships: pd.DataFrame = None
    alerts: pd.DataFrame = None
    validations: pd.DataFrame = None
    case_events: pd.DataFrame = None
    case_person: pd.DataFrame = None
    case_links: pd.DataFrame = None
    locations: pd.DataFrame = None
    phones: pd.DataFrame = None
    vehicles: pd.DataFrame = None
    organizations: pd.DataFrame = None
    entity_aliases: pd.DataFrame = None
    anomalies: pd.DataFrame = None
    document_narratives: pd.DataFrame = None
    case_phones: pd.DataFrame = None
    case_vehicles: pd.DataFrame = None
    case_orgs: pd.DataFrame = None
    case_locations: pd.DataFrame = None
    person_phones: pd.DataFrame = None
    person_vehicles: pd.DataFrame = None
    person_orgs: pd.DataFrame = None
    users: pd.DataFrame = None
    graph: nx.Graph = None
    audit_log: List[dict] = []

    @classmethod
    def load_all(cls):
        def load(name):
            path = DB_PATH / f"{name}.csv"
            if path.exists():
                return pd.read_csv(path, dtype=str).fillna("")
            return pd.DataFrame()

        cls.cases = load("cases")
        cls.persons = load("persons")
        cls.documents = load("documents")
        cls.relationships = load("relationships")
        cls.alerts = load("alerts")
        cls.validations = load("validations")
        cls.case_events = load("case_events")
        cls.case_person = load("case_person")
        cls.case_links = load("case_links")
        cls.locations = load("locations")
        cls.phones = load("phones")
        cls.vehicles = load("vehicles")
        cls.organizations = load("organizations")
        cls.entity_aliases = load("entity_aliases")
        cls.anomalies = load("anomalies")
        cls.document_narratives = load("document_narratives")
        cls.case_phones = load("case_phones")
        cls.case_vehicles = load("case_vehicles")
        cls.case_orgs = load("case_orgs")
        cls.case_locations = load("case_locations")
        cls.person_phones = load("person_phones")
        cls.person_vehicles = load("person_vehicles")
        cls.person_orgs = load("person_orgs")
        cls.users = load("users")

        cls._build_graph()
        print("[OK] CrimeIntel DataStore loaded successfully")

    @classmethod
    def _build_graph(cls):
        """Build NetworkX graph from relationships data."""
        G = nx.Graph()

        # Add person nodes
        for _, row in cls.persons.iterrows():
            G.add_node(row["person_id"], 
                      label=row["full_name"],
                      node_type="person",
                      alias=row.get("alias", ""),
                      role=row.get("role_profile", ""),
                      risk=row.get("risk_tag", "normal"))

        # Add phone nodes
        if not cls.phones.empty:
            for _, row in cls.phones.iterrows():
                G.add_node(row["phone_id"],
                          label=row.get("number", row["phone_id"]),
                          node_type="phone")

        # Add vehicle nodes
        if not cls.vehicles.empty:
            for _, row in cls.vehicles.iterrows():
                G.add_node(row["vehicle_id"],
                          label=row.get("registration", row["vehicle_id"]),
                          node_type="vehicle")

        # Add organization nodes
        if not cls.organizations.empty:
            for _, row in cls.organizations.iterrows():
                G.add_node(row["org_id"],
                          label=row.get("name", row["org_id"]),
                          node_type="organization")

        # Add edges from relationships
        for _, row in cls.relationships.iterrows():
            src = row["source_id"]
            tgt = row["target_id"]
            if G.has_node(src) and G.has_node(tgt):
                G.add_edge(src, tgt,
                          relationship_id=row["relationship_id"],
                          rel_type=row["relationship_type"],
                          confidence=float(row.get("confidence", 0.5)),
                          evidence_status=row.get("evidence_status", "pending"),
                          source_doc=row.get("source_document_id", ""),
                          explanation=row.get("explanation", ""),
                          first_seen=row.get("first_seen", ""),
                          last_seen=row.get("last_seen", ""))

        cls.graph = G

        # Compute centrality
        try:
            degree_cent = nx.degree_centrality(G)
            betweenness_cent = nx.betweenness_centrality(G, k=min(50, len(G.nodes)))
            nx.set_node_attributes(G, degree_cent, "degree_centrality")
            nx.set_node_attributes(G, betweenness_cent, "betweenness_centrality")
        except Exception as e:
            print(f"Warning: Centrality computation failed: {e}")

    @classmethod
    def add_audit(cls, user_id: str, action: str, entity_type: str, entity_id: str, detail: str = ""):
        import datetime
        cls.audit_log.append({
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "detail": detail
        })

    @classmethod
    def get_audit_log(cls) -> List[dict]:
        return cls.audit_log
