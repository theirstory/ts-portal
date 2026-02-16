# nlp-processor/batch_process.py
import json
import os
from pathlib import Path

import httpx

API_URL = os.getenv("NLP_PROCESSOR_URL", "http://localhost:8000")
INTERVIEWS_DIR = Path(os.getenv("INTERVIEWS_DIR", "../json/interviews")).resolve()
IGNORED_FILENAME = "example-minimum-interview.json"

def main():
    files = sorted(
        f for f in INTERVIEWS_DIR.glob("*.json")
        if f.name.lower() != IGNORED_FILENAME
    )
    if not files:
        print(f"No JSON files found in {INTERVIEWS_DIR}")
        return

    print(f"Found {len(files)} files in {INTERVIEWS_DIR}")
    with httpx.Client(timeout=300) as client:
        for f in files:
            payload = json.loads(f.read_text(encoding="utf-8"))

            # Tu endpoint espera {"payload": ...}
            res = client.post(
                f"{API_URL}/process-story",
                params={"write_to_weaviate": "true", "run_ner": "true"},
                json={"payload": payload},
            )

            if res.status_code >= 300:
                print(f"❌ {f.name}: {res.status_code} {res.text[:200]}")
                continue

            data = res.json()
            chunks = data.get("counts", {}).get("chunks", "?")
            print(f"✅ {f.name}: chunks={chunks}")

if __name__ == "__main__":
    main()
