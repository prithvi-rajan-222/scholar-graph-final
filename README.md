# Scholar Graph

Scholar Graph is a research exploration and learning assistant built for a hackathon demo. It combines a citation graph, lightweight product state, and AI-generated study artifacts to help a user:

- explore a research area visually
- understand which papers matter first
- generate a grounded learning plan
- get personalized "what should I read next?" recommendations
- analyze a professor's research arc and influence

## What It Does

The app is designed around a simple workflow:

1. Start with a topic such as `Transformers` or `Retrieval-augmented generation`.
2. Explore the paper graph and inspect important papers.
3. Generate a learning plan for a topic or a specific paper.
4. Mark papers as read to personalize future recommendations.
5. Search a professor to see their authored papers, cited foundations, and downstream influence.

## Core Features

- Interactive research graph
  - Explore topics, papers, and authors through a graph UI.
- Paper detail sidebar
  - Inspect abstract, topics, prerequisites, and follow-up papers.
- Learning plans
  - Generate a study path with ordered papers and lesson-by-lesson explanations.
- Follow-up Q&A
  - Ask questions about the current lesson inside the app.
- Further reading recommendations
  - Recommend next papers based on citation links and papers already marked as read.
- Professor analysis
  - Generate a research brief, future directions, and an influence graph for a professor.
- Artifact persistence
  - Save generated learning plans, recommendation runs, and professor briefs for later reopening.

## How It Works

Scholar Graph uses three main layers:

- `Neo4j`
  - Stores the research graph: papers, authors, topics, citations, and topic hierarchy.
- `SQLite` or `Postgres`
  - Stores product state such as read status and saved generated artifacts.
- `RocketRide`
  - Powers the generated learning plans, recommendation explanations, and professor briefs.

If RocketRide credentials are not configured, the backend still supports a fallback mode so the product remains demoable.

## Project Structure

- [`frontend/`](/Users/prithvirajan/Desktop/Coding/scholar-graph/frontend)
  - React + TypeScript + Vite frontend
- [`backend/`](/Users/prithvirajan/Desktop/Coding/scholar-graph/backend)
  - FastAPI backend, Neo4j access, product-state persistence
- [`pipelines/`](/Users/prithvirajan/Desktop/Coding/scholar-graph/pipelines)
  - RocketRide pipeline definitions used for generation
- [`rocketride/`](/Users/prithvirajan/Desktop/Coding/scholar-graph/rocketride)
  - Local RocketRide notes and helpers

## Demo Flow

The most effective way to demo the project is:

1. Open the graph and search for a topic.
2. Click into a paper and show the detail sidebar.
3. Generate a learning plan for that topic or paper.
4. Mark a few papers as `read`.
5. Open the Further Reading page to show personalized recommendations.
6. Search a professor and show the research evolution graph plus generated brief.

## Local Setup

### Backend

Requirements:

- Python 3.11+
- Neo4j running locally
- Optional RocketRide credentials for live generation

Install:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` from `backend/.env.example` and add the values you need. For the demo backend, the key settings are:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
PRODUCT_DATABASE_URL=sqlite:///./product_demo.db
DEMO_USER_ID=demo-user
DEMO_USER_NAME=Demo User
ROCKETRIDE_API_KEY=
ROCKETRIDE_URI=https://cloud.rocketride.ai
ROCKETRIDE_MODEL=openai/gpt-5.4
```

Start Neo4j:

```bash
docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest
```

Seed the graph:

```bash
cd backend
python -m ingestion.run
```

Run the backend:

```bash
cd backend
uvicorn app.main:app --reload
```

### Frontend

Install and run:

```bash
cd frontend
npm install
npm run dev
```

## Main Backend Endpoints

The backend exposes a demo-focused API:

- `GET /demo/bootstrap`
- `GET /demo/topic-mastery?topic=...`
- `GET /demo/recommendations?topic=...&user_id=demo-user`
- `GET /demo/professors/search?q=...`
- `GET /demo/professors/{author_id}/brief`
- `GET /demo/paper-status`
- `POST /demo/paper-status`
- `GET /learn/topic?topic=...`
- `GET /learn/paper/{paper_id}`

## Notes For Judges

- This repo is intended as a clean judging copy.
- Secrets should be supplied through local environment files and are not included in version control.
- The product is built to support both a live AI-backed path and a fallback mode for safer demos.

## Additional Docs

- [`backend/README.md`](/Users/prithvirajan/Desktop/Coding/scholar-graph/backend/README.md)
- [`frontend/README.md`](/Users/prithvirajan/Desktop/Coding/scholar-graph/frontend/README.md)
- [`rocketride/README.md`](/Users/prithvirajan/Desktop/Coding/scholar-graph/rocketride/README.md)
