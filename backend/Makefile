.PHONY: run test fmt seed-test-data

run:
	uvicorn app.main:app --reload

test:
	pytest qa/ -v --tb=short

test-cov:
	pytest qa/ -v --tb=short --cov=app --cov-report=html --cov-fail-under=0

seed-test-data:
	python -m scripts.seed_test_data

fmt:
	python -m pip install ruff black && ruff check --fix . && black .
