import json
import math

import numpy as np
import pandas as pd

# Load the CSV files from hammer-5-csv folder
product_df = pd.read_csv('hammer-5-csv/hammer-4-product.csv')
raw_path = 'hammer-5-csv/hammer-4-raw.csv'

with open(raw_path, 'r', encoding='utf-8') as f:
    total_rows = max(0, sum(1 for _ in f) - 1)

chunksize = max(1, math.ceil(total_rows / 10))
estimated_chunks = max(1, math.ceil(total_rows / chunksize))
print(f"Processing {total_rows} rows from {raw_path} in {estimated_chunks} chunks (chunksize={chunksize})")
latest_by_product = {}

for chunk in pd.read_csv(raw_path, chunksize=chunksize):
    chunk['nowtime'] = pd.to_datetime(chunk['nowtime'])
    latest_indices = chunk.groupby('product_id')['nowtime'].idxmax()
    latest_chunk = chunk.loc[latest_indices]

    for _, row in latest_chunk.iterrows():
        product_id = row['product_id']
        existing = latest_by_product.get(product_id)
        if existing is None or row['nowtime'] > existing['nowtime']:
            latest_by_product[product_id] = row

latest_raw = pd.DataFrame(latest_by_product.values())

final_df = product_df.merge(
    latest_raw[['product_id', 'current_price', 'old_price', 'price_per_unit', 'other']], 
    left_on='id', 
    right_on='product_id', 
    how='inner'
)

result = final_df.to_dict('records')
final_df_clean = final_df.replace({np.nan: None})

result = final_df_clean.to_dict('records')

with open('latest_grocery_data.json', 'w') as f:
    json.dump(result, f, indent=4)
