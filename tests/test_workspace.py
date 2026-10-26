"""Workspace wiring: every package is installed and importable."""

import importlib

import pytest

PACKAGES = ["contracts", "simulator", "insights", "scoring", "agents", "devserver"]


@pytest.mark.parametrize("name", PACKAGES)
def test_package_imports(name: str) -> None:
    importlib.import_module(name)
