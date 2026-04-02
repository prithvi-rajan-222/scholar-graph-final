from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException

from app.config import ROCKETRIDE_API_KEY, ROCKETRIDE_MODEL, ROCKETRIDE_URI
from app.services.rocketride_pipelines import get_pipeline_path

try:
    from rocketride import RocketRideClient
except Exception:  # pragma: no cover - optional dependency at runtime
    RocketRideClient = None


class RocketRideService:
    provider_name = "RocketRide"

    @property
    def model(self) -> str:
        return ROCKETRIDE_MODEL

    @property
    def configured(self) -> bool:
        return bool(ROCKETRIDE_URI and RocketRideClient is not None)

    def _raise_not_configured(self) -> None:
        if RocketRideClient is None:
            raise HTTPException(
                status_code=503,
                detail="RocketRide SDK is not installed. Run `pip install -r backend/requirements.txt`.",
            )
        raise HTTPException(
            status_code=503,
            detail="RocketRide is not configured. Set ROCKETRIDE_URI and ROCKETRIDE_API_KEY in backend/.env.",
        )

    async def check_connectivity(self) -> tuple[bool, str]:
        if RocketRideClient is None:
            return False, "RocketRide SDK is not installed."
        if not ROCKETRIDE_URI:
            return False, "RocketRide URI not configured."

        try:
            async with RocketRideClient(uri=ROCKETRIDE_URI, auth=ROCKETRIDE_API_KEY or "") as client:
                await client.ping()
            return True, "ok"
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            return False, str(exc)

    async def run_startup_check(self) -> tuple[bool, str]:
        ok, message = await self.check_connectivity()
        if not ok:
            return False, (
                "RocketRide is configured but unreachable. "
                f"URI={ROCKETRIDE_URI!r}. Details: {message}"
            )
        return True, "ok"

    def _extract_text(self, result: Mapping[str, Any]) -> str:
        data = result.get("data")
        if isinstance(data, Mapping):
            objects = data.get("objects")
            if isinstance(objects, Mapping):
                body = objects.get("body")
                if isinstance(body, Mapping):
                    answer = body.get("answer")
                    if isinstance(answer, list) and answer:
                        return "\n".join(str(item) for item in answer if item is not None).strip()
                    if isinstance(answer, str) and answer.strip():
                        return answer.strip()

        answers = result.get("answers")
        if isinstance(answers, list) and answers:
            return "\n".join(str(item) for item in answers if item is not None).strip()

        text = result.get("text")
        if isinstance(text, list) and text:
            return "\n".join(str(item) for item in text if item is not None).strip()

        result_types = result.get("result_types")
        if isinstance(result_types, dict):
            for field_name in result_types.keys():
                value = result.get(field_name)
                if isinstance(value, list) and value:
                    return "\n".join(str(item) for item in value if item is not None).strip()
                if isinstance(value, str) and value.strip():
                    return value.strip()
                if value is not None and not isinstance(value, (dict, Mapping)):
                    return str(value).strip()

        if "answer" in result and result["answer"] is not None:
            return str(result["answer"]).strip()

        return json.dumps(result)

    async def run_pipeline_text(
        self,
        *,
        pipeline_name: str,
        prompt: str,
        fallback: str | None = None,
    ) -> str:
        if not self.configured:
            if fallback is not None:
                return fallback
            self._raise_not_configured()

        pipeline_path = get_pipeline_path(pipeline_name)
        try:
            async with RocketRideClient(uri=ROCKETRIDE_URI, auth=ROCKETRIDE_API_KEY or "") as client:
                execution = await client.use(filepath=str(pipeline_path))
                token = execution["token"]
                try:
                    result = await client.send(
                        token,
                        prompt,
                        objinfo={"name": f"{pipeline_name}.txt"},
                        mimetype="text/plain",
                    )
                finally:
                    try:
                        await client.terminate(token)
                    except Exception:
                        pass
        except Exception as exc:
            if fallback is not None:
                return fallback
            raise HTTPException(status_code=502, detail=f"RocketRide pipeline failed: {exc}") from exc

        content = self._extract_text(result).strip()
        if content:
            return content
        if fallback is not None:
            return fallback
        raise HTTPException(status_code=502, detail="RocketRide pipeline returned empty content.")

    async def run_pipeline_json(
        self,
        *,
        pipeline_name: str,
        prompt: str,
        fallback: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        content = await self.run_pipeline_text(
            pipeline_name=pipeline_name,
            prompt=prompt,
            fallback=json.dumps(fallback) if fallback is not None else None,
        )
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end > start:
                return json.loads(content[start : end + 1])
            if fallback is not None:
                return fallback
            raise HTTPException(status_code=502, detail="RocketRide pipeline returned malformed JSON.")


rocketride_service = RocketRideService()
