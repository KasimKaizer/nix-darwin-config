#!/usr/bin/env python3
"""Run trigger evaluation for an Agent Skill description with Cursor Agent."""

import argparse
import json
import re
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from scripts.cursor_agent import run_cursor_agent
from scripts.utils import parse_skill_md


def parse_classifier_response(response: str) -> bool:
    """Return the classifier decision only for an exact protocol response."""
    match = re.fullmatch(r"<(invoke|skip)>", response.strip().lower())
    if match is None:
        raise ValueError(
            "Cursor Agent returned an invalid classifier response; expected exactly "
            "<invoke> or <skip>"
        )
    return match.group(1) == "invoke"


def run_single_query(
    query: str,
    skill_name: str,
    skill_description: str,
    timeout: int,
    model: str | None = None,
) -> bool:
    """Classify whether a skill should be invoked for one query.

    Cursor does not expose a documented skill-invocation event over its print
    mode, so this evaluates the description directly instead of attempting to
    emulate a provider-specific skills directory.
    """
    prompt = f"""Classify whether the Agent Skill below should be invoked for the user query.

<skill>
<name>{skill_name}</name>
<description>{skill_description}</description>
</skill>

<user_query>{query}</user_query>

Return exactly one tag and nothing else:
- <invoke> when the skill should be used.
- <skip> when the skill should not be used.
"""
    with tempfile.TemporaryDirectory(prefix="skill-creator-eval-") as workspace:
        response = run_cursor_agent(
            prompt,
            model,
            timeout=timeout,
            cwd=Path(workspace),
        )
    return parse_classifier_response(response)


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int,
    timeout: int,
    runs_per_query: int = 1,
    trigger_threshold: float = 0.5,
    model: str | None = None,
) -> dict:
    """Run the full eval set and return results.

    A failed classification aborts the evaluation rather than being counted as
    a negative response, because that could inflate scores for negative cases.
    """
    results = []
    errors = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        future_to_info = {}
        for item in eval_set:
            for run_idx in range(runs_per_query):
                future = executor.submit(
                    run_single_query,
                    item["query"],
                    skill_name,
                    description,
                    timeout,
                    model,
                )
                future_to_info[future] = (item, run_idx)

        query_triggers: dict[str, list[bool]] = {}
        query_items: dict[str, dict] = {}
        for future in as_completed(future_to_info):
            item, run_idx = future_to_info[future]
            query = item["query"]
            query_items[query] = item
            try:
                triggered = future.result()
            except Exception as error:
                errors.append(f"query {query!r}, run {run_idx + 1}: {error}")
                continue
            query_triggers.setdefault(query, []).append(triggered)

    if errors:
        raise RuntimeError(
            "Cursor Agent evaluation failed; no score was produced.\n"
            + "\n".join(errors)
        )

    for query, triggers in query_triggers.items():
        item = query_items[query]
        trigger_rate = sum(triggers) / len(triggers)
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        results.append(
            {
                "query": query,
                "should_trigger": should_trigger,
                "trigger_rate": trigger_rate,
                "triggers": sum(triggers),
                "runs": len(triggers),
                "pass": did_pass,
            }
        )

    passed = sum(1 for result in results if result["pass"])
    total = len(results)

    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Run trigger evaluation for an Agent Skill description"
    )
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument(
        "--description", default=None, help="Override description to test"
    )
    parser.add_argument(
        "--num-workers", type=int, default=10, help="Number of parallel workers"
    )
    parser.add_argument(
        "--timeout", type=int, default=30, help="Timeout per query in seconds"
    )
    parser.add_argument(
        "--runs-per-query", type=int, default=3, help="Number of runs per query"
    )
    parser.add_argument(
        "--trigger-threshold",
        type=float,
        default=0.5,
        help="Trigger rate threshold",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Cursor model to use (default: the configured Cursor model)",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Print progress to stderr"
    )
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, _ = parse_skill_md(skill_path)
    description = args.description or original_description

    if args.verbose:
        print(f"Evaluating: {description}", file=sys.stderr)

    try:
        output = run_eval(
            eval_set=eval_set,
            skill_name=name,
            description=description,
            num_workers=args.num_workers,
            timeout=args.timeout,
            runs_per_query=args.runs_per_query,
            trigger_threshold=args.trigger_threshold,
            model=args.model,
        )
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        summary = output["summary"]
        print(
            f"Results: {summary['passed']}/{summary['total']} passed",
            file=sys.stderr,
        )
        for result in output["results"]:
            status = "PASS" if result["pass"] else "FAIL"
            rate = f"{result['triggers']}/{result['runs']}"
            print(
                f"  [{status}] rate={rate} expected={result['should_trigger']}: "
                f"{result['query'][:70]}",
                file=sys.stderr,
            )

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
