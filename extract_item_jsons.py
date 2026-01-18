# Extract Item JSONs

"""Extract 'Successfully created JSON' entries from run_response.json log into item_json folder."""
import json
from pathlib import Path

RUN_RESPONSE_PATH = Path("test_folders/run_response.json")
ITEM_DIR = Path("item_json")
PREFIX = "__standard__: Successfully created JSON: "


def main():
    if not RUN_RESPONSE_PATH.exists():
        print(f"File not found: {RUN_RESPONSE_PATH}")
        return
    with open(RUN_RESPONSE_PATH, encoding="utf-8") as f:
        run_response = json.load(f)
    item_dir = ITEM_DIR
    item_dir.mkdir(exist_ok=True)
    item_saved = []
    all_objs = []
    for entry in run_response.get("log", []):
        if isinstance(entry, str) and entry.startswith(PREFIX):
            json_str = entry[len(PREFIX) :].strip()
            try:
                obj = json.loads(json_str)
                all_objs.append(obj)
                path = item_dir / f"item_{len(item_saved)}.json"
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(obj, f, indent=2, ensure_ascii=False)
                item_saved.append(str(path))
                print("Saved item JSON:", path)
            except json.JSONDecodeError:
                pass
    # Build combined JSON: store is always the last JSON created; the rest are items
    store = all_objs[-1] if all_objs else {}
    items = all_objs[:-1]
    combined = {"store": store, "items": items}
    with open(item_dir / "combined.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)
    print("Saved combined.json (store +", len(items), "items)")
    if item_saved:
        print("Item JSONs saved in item_json:", item_saved)
    else:
        print("No 'Successfully created JSON' entries found in log.")


if __name__ == "__main__":
    main()
