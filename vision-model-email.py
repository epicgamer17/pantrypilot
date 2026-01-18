import requests
import json
import time
import re
import shutil
from pathlib import Path
import os


# Clear item_json and test_folders from previous runs
for folder in (Path("test_folders"), Path("item_json")):
    if folder.exists():
        shutil.rmtree(folder)

url = os.getenv("EMAIL_URL")
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ef1f551abfa5460f945f8a5e32979b91"
}


print("Request URL:", url)

response = requests.post(url, headers=headers)
print("\n--- Start pipeline response ---")
print("Status Code:", response.status_code)
print("Response Text:", response.text)

result = response.json()
run_id = result.get("run_id")

if not run_id:
    # Maybe synchronous: outputs returned directly
    if "outputs" in result and result.get("state") == "DONE":
        outputs = result["outputs"]
        run_id = None  # skip polling
    else:
        print("No run_id in response. Full response:", json.dumps(result, indent=2))
        exit(1)

if run_id:
    # Poll get_pl_run until DONE or FAILED
    poll_url = os.getenv("BASE_URL") + "/get_pl_run"
    timeout_sec = 120
    poll_interval = 2
    start = time.time()
    while True:
        if time.time() - start > timeout_sec:
            print("Polling timed out")
            exit(1)
        r = requests.get(poll_url, params={"run_id": run_id, "user_id": os.getenv("USER_ID")}, headers=headers)
        data = r.json()
        state = data.get("state", "")
        print(f"Run state: {state}")
        if state == "DONE":
            outputs = data.get("outputs", {})
            break
        if state == "FAILED":
            print("Run failed:", json.dumps(data, indent=2))
            exit(1)
        time.sleep(poll_interval)

# Full run response (from get_pl_run when we polled, or start_pipeline when synchronous)
run_response = data if run_id else result

# Create test_folders and save each output as a JSON file
out_dir = Path("test_folders")
out_dir.mkdir(exist_ok=True)


def _sanitize_filename(name: str) -> str:
    return re.sub(r'[^\w\-.]', '_', name)


def _to_serializable(obj):
    """Recursively ensure object is JSON-serializable (e.g. convert any bytes to str)."""
    if isinstance(obj, dict):
        return {k: _to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_serializable(v) for v in obj]
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return obj


saved = []
for name, value in outputs.items():
    safe_name = _sanitize_filename(name) or "output"
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = {"raw": value}
    value = _to_serializable(value)

    # If it's a list of JSON objects, save each as a separate file
    if isinstance(value, list) and value and all(isinstance(x, dict) for x in value):
        for i, item in enumerate(value):
            path = out_dir / f"{safe_name}_{i}.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(item, f, indent=2, ensure_ascii=False)
            saved.append(str(path))
            print("Saved", path)
    else:
        path = out_dir / f"{safe_name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(value, f, indent=2, ensure_ascii=False)
        saved.append(str(path))
        print("Saved", path)

if not saved:
    # No outputs: save full run response for inspection
    path = out_dir / "run_response.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_to_serializable(run_response), f, indent=2, ensure_ascii=False)
    print("No outputs; saved full response to", path)
else:
    print("\nAll JSONs saved in test_folders:", saved)

# Extract "Successfully created JSON" entries from log and save to item_json
item_dir = Path("item_json")
item_dir.mkdir(exist_ok=True)
prefix = "__standard__: Successfully created JSON: "
item_saved = []
all_objs = []
for entry in run_response.get("log", []):
    if isinstance(entry, str) and entry.startswith(prefix):
        json_str = entry[len(prefix) :].strip()
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
def _has_location_address(obj):
    """True if the object has location/address fields (ignore such JSONs after the first)."""
    if not isinstance(obj, dict):
        return False
    if "address" in obj or "location" in obj:
        return True
    if "location.address" in obj or "location.adress" in obj:
        return True
    loc = obj.get("location")
    if isinstance(loc, dict) and "address" in loc:
        return True
    return False


# Build combined JSON: store is always the first JSON created; the rest are items.
# Ignore any JSON after the first that has location.address (or location.adress) parameters.
store = all_objs[0] if all_objs else {}
items = [o for o in all_objs[1:] if not _has_location_address(o)]
combined = {"store": store, "items": items}
with open(item_dir / "combined.json", "w", encoding="utf-8") as f:
    json.dump(combined, f, indent=2, ensure_ascii=False)
print("Saved combined.json (store +", len(items), "items)")
if item_saved:
    print("Item JSONs saved in item_json:", item_saved)
