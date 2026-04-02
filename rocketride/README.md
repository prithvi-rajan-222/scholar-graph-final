# RocketRide Pipelines

This directory contains the local RocketRide pipeline definitions used by the app.

Each `*.pipe` file is JSON in the wrapper format supported by the RocketRide Python SDK:

```json
{
  "pipeline": {
    "name": "Example",
    "project_id": "uuid",
    "source": "webhook_1",
    "components": []
  }
}
```

These files are intended to be opened and refined in the RocketRide VS Code extension.

## Pipelines

- `pipelines/topic_learning_plan.pipe`
- `pipelines/paper_summary.pipe`
- `pipelines/reading_recommendation_explainer.pipe`
- `pipelines/professor_research_brief.pipe`
- `pipelines/future_research_directions.pipe`

## How the app uses them

The backend resolves a pipeline by name, calls RocketRide's Python client with:

- `client.use(filepath=...)`
- `client.send(token, prompt, mimetype="text/plain")`

and then extracts the text/answer field from the pipeline result.

## Environment variables

The `.pipe` files use RocketRide environment substitution where appropriate:

- `ROCKETRIDE_MODEL`

Runtime connection settings are read by the backend:

- `ROCKETRIDE_URI`
- `ROCKETRIDE_APIKEY`
- `ROCKETRIDE_MODEL`

## Recommended workflow

1. Open this repo in VS Code
2. Open the RocketRide extension
3. Load the `.pipe` files from `rocketride/pipelines/`
4. Adjust node config visually as needed
5. Keep the file names stable so the backend can continue resolving them by name
