"""Tests for Cursor-based skill-description evaluation."""

from __future__ import annotations

import unittest
from concurrent.futures import Future
from pathlib import Path
from unittest.mock import patch

from scripts import improve_description, run_eval


class InlineExecutor:
    """A deterministic executor used to test evaluation error propagation."""

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def submit(self, function, *args, **kwargs):
        future = Future()
        try:
            future.set_result(function(*args, **kwargs))
        except Exception as error:
            future.set_exception(error)
        return future


class CursorEvaluationTests(unittest.TestCase):
    def test_accepts_only_a_complete_invoke_or_skip_tag(self):
        self.assertTrue(run_eval.parse_classifier_response(" <invoke>\n"))
        self.assertFalse(run_eval.parse_classifier_response("<skip>"))

        for response in (
            "Explanation: <invoke> is available, but the answer is <skip>.",
            "<invoke><skip>",
            "invoke",
            "",
        ):
            with self.subTest(response=response):
                with self.assertRaises(ValueError):
                    run_eval.parse_classifier_response(response)

    @patch("scripts.run_eval.run_cursor_agent", return_value="<invoke>")
    def test_classifier_uses_an_isolated_temporary_workspace(self, run_cursor_agent):
        self.assertTrue(
            run_eval.run_single_query(
                "author a skill",
                "skill-creator",
                "Create Agent Skills.",
                timeout=1,
                model=None,
            )
        )

        cwd = run_cursor_agent.call_args.kwargs["cwd"]
        self.assertIsInstance(cwd, Path)
        self.assertNotEqual(cwd, Path.cwd())
        self.assertTrue(cwd.name.startswith("skill-creator-eval-"))

    def test_improver_uses_cursor_for_initial_and_shortening_calls(self):
        responses = [
            f"<new_description>{'x' * 1025}</new_description>",
            "<new_description>Use this skill to author skills.</new_description>",
        ]
        eval_results = {"results": [], "summary": {"passed": 0, "total": 0}}

        with patch(
            "scripts.improve_description.run_cursor_agent", side_effect=responses
        ) as run_cursor_agent:
            description = improve_description.improve_description(
                "skill-creator",
                "skill content",
                "old description",
                eval_results,
                [],
                None,
            )

        self.assertEqual(description, "Use this skill to author skills.")
        self.assertEqual(run_cursor_agent.call_count, 2)
        for call in run_cursor_agent.call_args_list:
            cwd = call.kwargs["cwd"]
            self.assertIsInstance(cwd, Path)
            self.assertTrue(cwd.name.startswith("skill-creator-optimizer-"))

    def test_evaluation_fails_when_a_classifier_invocation_fails(self):
        eval_set = [{"query": "author a skill", "should_trigger": True}]

        with (
            patch("scripts.run_eval.ProcessPoolExecutor", InlineExecutor),
            patch("scripts.run_eval.as_completed", lambda futures: futures),
            patch(
                "scripts.run_eval.run_single_query",
                side_effect=RuntimeError("Cursor unavailable"),
            ),
            self.assertRaisesRegex(RuntimeError, "Cursor unavailable"),
        ):
            run_eval.run_eval(
                eval_set=eval_set,
                skill_name="skill-creator",
                description="Create Agent Skills.",
                num_workers=1,
                timeout=1,
                runs_per_query=1,
                trigger_threshold=0.5,
                model=None,
            )


if __name__ == "__main__":
    unittest.main()
