from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth, cases, inputs, analyze, entities, graph, evidence, report, audit, dashboard, analysis_views, resources, global_views, admin, connectors, mosint

app = FastAPI(
    title="TraceNet AI API",
    description="Agentic SOCMINT case management platform — public-data-only investigative leads. "
                "Human review required.",
    version="0.1.0",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "service": "tracenet-ai-api"}


app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(inputs.router)
app.include_router(analyze.router)
app.include_router(entities.router)
app.include_router(graph.router)
app.include_router(evidence.router)
app.include_router(report.router)
app.include_router(audit.router)
app.include_router(audit.global_router)
app.include_router(dashboard.router)
app.include_router(analysis_views.router)
app.include_router(resources.router)
app.include_router(global_views.router)
app.include_router(admin.router)
app.include_router(connectors.router)
app.include_router(mosint.router)
