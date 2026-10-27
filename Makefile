.PHONY: install check contracts

install:
	uv sync --locked
	cd web && pnpm install --frozen-lockfile

check:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy
	uv run pytest
	cd web && pnpm gen:contracts --check && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test

contracts:
	uv run python -m contracts.schema
	cd web && pnpm gen:contracts
