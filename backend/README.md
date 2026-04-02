# Scholar Graph Backend

Local demo backend for a Neo4j-first research product:

- Neo4j stores the paper, topic, citation, and professor graph
- SQLite or Postgres stores product state such as reading status and generated artifacts
- RocketRide powers topic mastery, recommendation explanations, paper summaries, and professor briefs

## Requirements

- Python 3.11+
- Neo4j running locally
- Optional local Postgres if you do not want the default SQLite product DB
- RocketRide credentials if you want live generations instead of fallback mode

## Install

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Set these in `backend/.env`:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Product state DB:
# SQLite default
PRODUCT_DATABASE_URL=sqlite:///./product_demo.db

# Or local Postgres
# PRODUCT_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/scholar_graph

DEMO_USER_ID=demo-user
DEMO_USER_NAME=Demo User

ROCKETRIDE_API_KEY=
ROCKETRIDE_URI=https://cloud.rocketride.ai
ROCKETRIDE_MODEL=openai/gpt-5.4
```

If `ROCKETRIDE_API_KEY` is omitted, the app still works in a local fallback mode, but live generation calls will not use RocketRide.
The app now executes real RocketRide `.pipe` files from [`/rocketride/pipelines`](/Users/prithvirajan/Desktop/Coding/scholar-graph/rocketride/pipelines) via the RocketRide Python SDK.
You can open those pipeline files in the RocketRide VS Code extension and refine them visually without changing the backend route layer.

## Start Neo4j

```bash
docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest
```

## Seed the graph

```bash
python -m ingestion.run
```

This keeps Neo4j as the core graph store for:

- papers
- authors / professors
- topics and hierarchy nodes
- `CITES`, `AUTHORED_BY`, `COVERS`, `BELONGS_TO`
- derived prerequisite links

## Run the API

```bash
uvicorn app.main:app --reload
```

## Main demo endpoints

- `GET /demo/bootstrap`
  - featured topics, featured professors, RocketRide status
- `GET /demo/topic-mastery?topic=Transformers`
  - grounded topic overview
- `GET /demo/recommendations?topic=Transformers&user_id=demo-user`
  - graph-backed next-paper recommendations
- `GET /demo/professors/search?q=Andrew`
  - professor lookup
- `GET /demo/professors/{author_id}/brief`
  - research brief plus future directions
- `GET /demo/paper-status`
  - product-state status list from SQLite/Postgres
- `POST /demo/paper-status`
  - set `to_read`, `reading`, `read`, or `skipped`

The older graph and learning routes still work, but the local demo should now center on the `/demo/*` workflows.
