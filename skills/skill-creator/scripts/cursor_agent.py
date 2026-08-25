"""Run the Cursor CLI installed by Home Manager or Zed's ACP Registry."""

from __future__ import annotations

import os
import shlex
import shutil
import subprocess
from pathlib import Path

_CURSOR_AGENT_ENV = "SKILL_CREATOR_CURSOR_AGENT"
_ZED_CURSOR_REGISTRY = (
    Path.home()
    / "Library"
    / "Application Support"
    / "Zed"
    / "external_agents"
    / "registry"
    / "cursor"
)


def cursor_agent_command() -> list[str]:
    """Return a command for Cursor's CLI without installing another copy."""
    override = os.environ.get(_CURSOR_AGENT_ENV, "").strip()
    if override:
        command = shlex.split(override)
        if command:
            return command
        raise RuntimeError(f"{_CURSOR_AGENT_ENV} must contain a command")

    installed_command = shutil.which("cursor-agent")
    if installed_command:
        return [installed_command]

    registry_candidates = [
        candidate
        for candidate in _ZED_CURSOR_REGISTRY.glob("v_*/dist-package/cursor-agent")
        if candidate.is_file() and os.access(candidate, os.X_OK)
    ]
    if registry_candidates:
        latest = max(
            registry_candidates, key=lambda candidate: candidate.stat().st_mtime
        )
        return [str(latest)]

    raise RuntimeError(
        "Cursor Agent is unavailable. Run nixswitch to install cursor-cli, or install "
        "Cursor from Zed's ACP Registry. Set SKILL_CREATOR_CURSOR_AGENT to override "
        "the command location."
    )


def run_cursor_agent(
    prompt: str, model: str | None, timeout: int, cwd: Path | None = None
) -> str:
    """Run a read-only Cursor prompt and return its text response."""
    command = [
        *cursor_agent_command(),
        "--print",
        "--output-format",
        "text",
        "--mode",
        "ask",
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)

    result = subprocess.run(  # noqa: PLW1510
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Cursor Agent exited {result.returncode}\nstderr: {result.stderr.strip()}"
        )
    return result.stdout
