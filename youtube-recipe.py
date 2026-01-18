import requests
import json
import time
import re
import shutil
from pathlib import Path
import os

BASE_URL = os.getenv("BASE_URL")
USER_ID = os.getenv("USER_ID")
SAVED_ITEM_ID = os.getenv("SAVED_ITEM_ID")

# Clear item_json and test_folders from previous runs
for folder in (Path("test_folders"), Path("item_json")):
    if folder.exists():
        shutil.rmtree(folder)

url = "https://api.gumloop.com/api/v1/start_pipeline?api_key=ef1f551abfa5460f945f8a5e32979b91&user_id=6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2&saved_item_id=hFMQjdfjvPobH137HhPmLQ"

headers = {
    "Content-Type": "application/json",
    "Authorization": os.getenv("API_KEY")
}

payload = {
    "article_url": "https://www.youtube.com/watch?v=TdmFXcvP6zM&t=282s&pp=ygUfY29va2luZyByZWNpcGUgY2hpY2tlbiB0ZXJpeWFraQ%3D%3D"
}

print("Request URL:", url)
print("Payload:", json.dumps(payload, indent=2))

response = requests.post(url, json=payload, headers=headers)
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
    poll_url = f"{BASE_URL}/get_pl_run"
    timeout_sec = 120
    poll_interval = 2
    start = time.time()
    while True:
        if time.time() - start > timeout_sec:
            print("Polling timed out")
            exit(1)
        r = requests.get(poll_url, params={"run_id": run_id, "user_id": USER_ID}, headers=headers)
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

# Full run response
run_response = data if run_id else result

# Create test_folders and save full response for inspection
out_dir = Path("test_folders")
out_dir.mkdir(exist_ok=True)
path = out_dir / "run_response.json"
with open(path, "w", encoding="utf-8") as f:
    json.dump(run_response, f, indent=2, ensure_ascii=False)
print("Saved full response to", path)

# Extract recipe data from logs
def extract_recipe_from_logs(run_response):
    """Extract and format recipe data from Gumloop log entries"""
    logs = run_response.get("log", [])
    extracted_data = {}
    
    def clean_value(value):
        """Replace 'Unknown' or 'N/A' with empty string"""
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned.lower() in ['unknown', 'n/a', 'na']:
                return ""
            return cleaned
        return value
    
    # Parse log entries for extracted data
    for log_entry in logs:
        if "__standard__: Key item" in log_entry and "extracted successfully:" in log_entry:
            # Extract key and value from log entry (use DOTALL to handle multiline values)
            match = re.match(r"__standard__: Key item '([^']+)' extracted successfully: (.+)", log_entry, re.DOTALL)
            if match:
                key = match.group(1)
                value = clean_value(match.group(2))
                extracted_data[key] = value
    
    # Build clean recipe JSON according to schema
    recipe = {}
    
    # Basic string fields - only add if not empty after cleaning
    if "name" in extracted_data and extracted_data["name"]:
        recipe["name"] = extracted_data["name"]
    
    if "description" in extracted_data and extracted_data["description"]:
        recipe["description"] = extracted_data["description"]
    
    if "imageUrl" in extracted_data and extracted_data["imageUrl"]:
        recipe["imageUrl"] = extracted_data["imageUrl"]
    
    if "sourceUrl" in extracted_data and extracted_data["sourceUrl"]:
        recipe["sourceUrl"] = extracted_data["sourceUrl"]
    
    if "sourceType" in extracted_data and extracted_data["sourceType"]:
        recipe["sourceType"] = extracted_data["sourceType"]
    
    # Numeric fields
    if "prepTime" in extracted_data and extracted_data["prepTime"]:
        try:
            recipe["prepTime"] = int(extracted_data["prepTime"])
        except (ValueError, TypeError):
            pass
    
    if "cookTime" in extracted_data and extracted_data["cookTime"]:
        try:
            recipe["cookTime"] = int(extracted_data["cookTime"])
        except (ValueError, TypeError):
            pass
    
    if "servings" in extracted_data and extracted_data["servings"]:
        try:
            recipe["servings"] = int(extracted_data["servings"])
        except (ValueError, TypeError):
            pass
    
    if "difficulty" in extracted_data and extracted_data["difficulty"]:
        recipe["difficulty"] = extracted_data["difficulty"]
    
    if "cuisine" in extracted_data and extracted_data["cuisine"]:
        recipe["cuisine"] = extracted_data["cuisine"]
    
    # Array fields - parse JSON strings
    if "tags" in extracted_data and extracted_data["tags"]:
        try:
            tags = json.loads(extracted_data["tags"])
            # Clean tags array - remove empty strings, "Unknown", and "N/A"
            cleaned_tags = [clean_value(tag) for tag in tags if clean_value(tag)]
            if cleaned_tags:
                recipe["tags"] = cleaned_tags
        except json.JSONDecodeError:
            pass
    
    if "ingredients" in extracted_data and extracted_data["ingredients"]:
        try:
            ingredients = json.loads(extracted_data["ingredients"])
            # Clean and convert quantity strings
            for ingredient in ingredients:
                # Clean string fields
                for key in ["itemId", "unit", "notes"]:
                    if key in ingredient:
                        ingredient[key] = clean_value(ingredient[key])
                
                # Convert quantity strings to numbers where possible
                if "quantity" in ingredient and ingredient["quantity"]:
                    cleaned_qty = clean_value(str(ingredient["quantity"]))
                    if cleaned_qty:
                        try:
                            ingredient["quantity"] = float(cleaned_qty)
                        except (ValueError, TypeError):
                            ingredient["quantity"] = ""
                    else:
                        ingredient["quantity"] = ""
            recipe["ingredients"] = ingredients
        except json.JSONDecodeError:
            pass
    
    if "instructions" in extracted_data and extracted_data["instructions"]:
        try:
            instructions = json.loads(extracted_data["instructions"])
            # Clean string fields in instructions
            for instruction in instructions:
                if "instruction" in instruction:
                    instruction["instruction"] = clean_value(instruction["instruction"])
                if "imageUrl" in instruction:
                    instruction["imageUrl"] = clean_value(instruction["imageUrl"])
            recipe["instructions"] = instructions
        except json.JSONDecodeError:
            pass
    
    # Nutritional info
    nutritional_info = {}
    nutritional_fields = [
        "totalCalories", "caloriesPerServing", "protein", 
        "carbs", "fat", "fiber", "sugar", "sodium"
    ]
    
    for field in nutritional_fields:
        if field in extracted_data:
            try:
                value = float(extracted_data[field])
                if value > 0:  # Only include non-zero values
                    nutritional_info[field] = value
            except (ValueError, TypeError):
                pass
    
    if nutritional_info:
        recipe["nutritionalInfo"] = nutritional_info
    
    return recipe

# Extract and save clean recipe JSON
recipe_data = extract_recipe_from_logs(run_response)
recipe_path = out_dir / "recipe.json"
with open(recipe_path, "w", encoding="utf-8") as f:
    json.dump(recipe_data, f, indent=2, ensure_ascii=False)
print(f"Saved clean recipe JSON to {recipe_path}")
print(json.dumps(recipe_data, indent=2, ensure_ascii=False))
