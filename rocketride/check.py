"""
RocketRide pipeline check script.

Run from the project root:
    python rocketride/check.py

Or from the rocketride/ directory:
    python check.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
THIS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = THIS_DIR.parent
PIPELINE_DIR = THIS_DIR / "pipelines"
ENV_FILE = PROJECT_ROOT / "backend" / ".env"

# ---------------------------------------------------------------------------
# Load backend .env so ROCKETRIDE_URI, GMI_API_KEY, ROCKETRIDE_OPENAI_KEY
# are available for env-var substitution inside the pipeline files.
# ---------------------------------------------------------------------------
try:
    from dotenv import dotenv_values
    env = dotenv_values(ENV_FILE)
except ImportError:
    print("ERROR: python-dotenv is not installed. Run: pip install python-dotenv")
    sys.exit(1)

ROCKETRIDE_URI = env.get("ROCKETRIDE_URI", "http://localhost:5565")
# Backend uses GMI_API_KEY as fallback for ROCKETRIDE_API_KEY
ROCKETRIDE_API_KEY = env.get("ROCKETRIDE_API_KEY") or env.get("GMI_API_KEY", "")

try:
    from rocketride import RocketRideClient
except ImportError:
    print("ERROR: rocketride SDK is not installed. Run: pip install rocketride")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Test cases: (pipeline_name, sample_prompt)
# ---------------------------------------------------------------------------
TESTS = [
    (
        "paper_summary",
        (
            "Summarize this paper for a student in 4 to 6 sentences.\n"
            "Title: Attention Is All You Need\n"
            "Year: 2017\n"
            "Citations: 80000\n"
            "Authors: Vaswani et al.\n"
            "Topics: Transformers, Self-Attention, NLP\n"
            "Abstract: The dominant sequence transduction models are based on complex recurrent or "
            "convolutional neural networks. We propose a new simple network architecture, the "
            "Transformer, based solely on attention mechanisms. Experiments on two machine "
            "translation tasks show these models to be superior in quality while being more "
            "parallelizable and requiring significantly less time to train.\n"
            "Stay grounded in the provided evidence only."
        ),
    ),
    (
        "topic_learning_plan",
        (
            "A student wants to master: \"Transformer attention mechanism\"\n\n"
            "Here are 2 papers from the citation graph, already ordered by the app:\n\n"
            "Title: Attention Is All You Need\n"
            "Paper ID: paper001\n"
            "Role: TARGET (2017, 80,000 citations)\n"
            "Abstract: We propose a new simple network architecture, the Transformer, based solely on "
            "attention mechanisms, dispensing with recurrence and convolutions entirely.\n\n"
            "Title: BERT: Pre-training of Deep Bidirectional Transformers\n"
            "Paper ID: paper002\n"
            "Role: FOLLOW-UP / BUILDS ON (2019, 50,000 citations)\n"
            "Abstract: We introduce BERT, a new language representation model which stands for "
            "Bidirectional Encoder Representations from Transformers. BERT is designed to pre-train "
            "deep bidirectional representations from unlabeled text."
        ),
    ),
    (
        "professor_research_brief",
        (
            "Professor: Yoshua Bengio\n"
            "Institution: Université de Montréal\n\n"
            "Research papers:\n\n"
            "Title: Learning Long-Term Dependencies with Gradient Descent is Difficult\n"
            "Year: 1994\n"
            "Abstract: This paper studies the problem of learning long-term dependencies in recurrent "
            "networks. We show that gradient-based methods have fundamental problems learning "
            "long-term dependencies.\n\n"
            "Title: A Neural Probabilistic Language Model\n"
            "Year: 2003\n"
            "Abstract: We propose to learn a distributed representation for words which allows each "
            "training sentence to inform the model about an exponential number of semantically "
            "neighboring sentences."
        ),
    ),
    (
        "reading_recommendation_explainer",
        (
            "Recommended paper:\n"
            "Title: Attention Is All You Need\n"
            "Year: 2017\n"
            "Abstract: We propose the Transformer, based solely on attention mechanisms, dispensing "
            "with recurrence and convolutions entirely.\n\n"
            "Student context:\n"
            "The student is studying NLP and has just completed a lesson on RNNs and their "
            "limitations with long sequences. They understand gradient flow problems in deep networks."
        ),
    ),
    (
        "future_research_directions",
        (
            "Professor: Yoshua Bengio\n"
            "Research area: Deep Learning, Generative Models\n\n"
            "Recent papers:\n\n"
            "Title: Generative Adversarial Nets\n"
            "Year: 2014\n"
            "Abstract: We propose a framework for estimating generative models via an adversarial "
            "process, in which we simultaneously train two models: a generative model G that captures "
            "the data distribution, and a discriminative model D that estimates the probability that a "
            "sample came from the training data rather than G.\n\n"
            "Title: Attention Is All You Need\n"
            "Year: 2017\n"
            "Abstract: We propose the Transformer, based solely on attention mechanisms, dispensing "
            "with recurrence and convolutions entirely. The Transformer is the first transduction model "
            "relying entirely on self-attention to compute representations of its input and output."
        ),
    ),
]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def run_pipeline(client: RocketRideClient, pipeline_name: str, prompt: str) -> str:
    pipe_path = PIPELINE_DIR / f"{pipeline_name}.pipe"
    execution = await client.use(filepath=str(pipe_path))
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

    # Extract text from result
    answers = result.get("answers")
    if isinstance(answers, list) and answers:
        return "\n".join(str(a) for a in answers if a).strip()
    text = result.get("text")
    if isinstance(text, list) and text:
        return "\n".join(str(t) for t in text if t).strip()
    if "answer" in result:
        return str(result["answer"]).strip()
    import json
    return json.dumps(result)


async def main() -> None:
    print(f"RocketRide URI : {ROCKETRIDE_URI}")
    print(f"API key        : {'set' if ROCKETRIDE_API_KEY else 'NOT SET'}")
    print(f"Pipeline dir   : {PIPELINE_DIR}")
    print()

    # --- connectivity check ---
    print("=== Connectivity check ===")
    try:
        async with RocketRideClient(uri=ROCKETRIDE_URI, auth=ROCKETRIDE_API_KEY) as client:
            await client.ping()
        print("PASS  ping succeeded\n")
    except Exception as exc:
        print(f"FAIL  ping failed: {exc}")
        print("\nMake sure the RocketRide server is running at", ROCKETRIDE_URI)
        sys.exit(1)

    # --- pipeline tests ---
    print("=== Pipeline tests ===\n")
    passed = 0
    failed = 0

    async with RocketRideClient(uri=ROCKETRIDE_URI, auth=ROCKETRIDE_API_KEY) as client:
        for pipeline_name, prompt in TESTS:
            pipe_path = PIPELINE_DIR / f"{pipeline_name}.pipe"
            if not pipe_path.exists():
                print(f"SKIP  {pipeline_name}  (file not found: {pipe_path})")
                failed += 1
                continue

            print(f"--- {pipeline_name} ---")
            try:
                output = await run_pipeline(client, pipeline_name, prompt)
                if output:
                    preview = output[:300].replace("\n", " ")
                    print(f"PASS  {preview}{'...' if len(output) > 300 else ''}")
                    passed += 1
                else:
                    print("FAIL  pipeline returned empty output")
                    failed += 1
            except Exception as exc:
                print(f"FAIL  {exc}")
                failed += 1
            print()

    print(f"=== Results: {passed} passed, {failed} failed ===")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
