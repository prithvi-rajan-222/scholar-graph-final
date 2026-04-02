import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import graph, ai, user, learn
from app.db import get_driver, close_driver
from app.config import DEMO_USER_ID, DEMO_USER_NAME
from app.product_db import get_product_session, init_product_db
from app.repositories.product_repository import ProductRepository
from app.routes import demo
from app.services.rocketride import rocketride_service
from app.services.rocketride_pipelines import validate_pipeline_files

logger = logging.getLogger("scholar-graph.startup")

app = FastAPI(title="Scholar Graph API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph.router, prefix="/graph", tags=["graph"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(user.router, prefix="/user", tags=["user"])
app.include_router(learn.router, prefix="/learn", tags=["learn"])
app.include_router(demo.router, prefix="/demo", tags=["demo"])


@app.get("/")
async def health_check():
    neo4j_ok = False
    product_db_ok = False
    rocketride_ok = False
    rocketride_message = "not configured"
    try:
        driver = get_driver()
        driver.verify_connectivity()
        neo4j_ok = True
    except Exception:
        pass
    try:
        with get_product_session() as session:
            ProductRepository(session).ensure_user(DEMO_USER_ID, name=DEMO_USER_NAME)
            product_db_ok = True
    except Exception:
        pass
    if rocketride_service.configured:
        try:
            rocketride_ok, rocketride_message = await rocketride_service.check_connectivity()
        except Exception as exc:
            rocketride_ok = False
            rocketride_message = str(exc)
    return {
        "status": "ok",
        "neo4j": neo4j_ok,
        "product_db": product_db_ok,
        "rocketride": {"ok": rocketride_ok, "message": rocketride_message},
    }


@app.on_event("startup")
async def startup():
    missing_pipeline_files = validate_pipeline_files()
    if missing_pipeline_files:
        raise RuntimeError(
            "RocketRide pipeline validation failed:\n" + "\n".join(f"- {item}" for item in missing_pipeline_files)
        )

    init_product_db()
    with get_product_session() as session:
        ProductRepository(session).ensure_user(DEMO_USER_ID, name=DEMO_USER_NAME)

    if rocketride_service.configured:
        ok, message = await rocketride_service.run_startup_check()
        if not ok:
            logger.warning(message)


@app.on_event("shutdown")
def shutdown():
    close_driver()
