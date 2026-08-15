import json
import os

# backend directory
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# backend/workflows
WORKFLOWS_DIR = os.path.join(BACKEND_DIR, "workflows")


def load_workflow(name: str):
    path = os.path.join(WORKFLOWS_DIR, name)

    print(f"Loading workflow: {path}")

    if not os.path.exists(path):
        raise FileNotFoundError(f"Workflow not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)