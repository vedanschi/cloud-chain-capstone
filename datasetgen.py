import csv
import random
import itertools

def generate_decoupled_datasets():
    nodes = ["Node-North", "Node-South", "Node-East", "Node-West", "Node-Central"]
    
    # ---------------------------------------------------------
    # 1. Generate Distance Matrix (network_distances.csv)
    # ---------------------------------------------------------
    distance_filename = "network_distances.csv"
    with open(distance_filename, mode="w", newline="") as d_file:
        writer = csv.writer(d_file)
        writer.writerow(["Origin_Node", "Destination_Node", "Distance_Miles"])
        
        # Generate distances for every unique pair of nodes
        for origin, dest in itertools.combinations(nodes, 2):
            distance = random.randint(100, 2500)
            # Write both directions for easy lookup
            writer.writerow([origin, dest, distance])
            writer.writerow([dest, origin, distance])
            
    print(f"Generated {distance_filename} successfully.")

    # ---------------------------------------------------------
    # 2. Generate Inventory State (inventory_state.csv)
    # ---------------------------------------------------------
    inventory_filename = "inventory_state.csv"
    
    # Create a Master Catalog of 100 unique SKUs with fixed prices
    master_catalog = {}
    for _ in range(100):
        sku = f"ITEM-{random.randint(1000, 9999)}"
        master_catalog[sku] = round(random.uniform(50.0, 800.0), 2)
        
    skus_list = list(master_catalog.keys())
    
    # Keep track of generated SKU-Node pairs to prevent duplicates
    generated_pairs = set()
    inventory_records = []
    
    while len(inventory_records) < 250:
        sku = random.choice(skus_list)
        node = random.choice(nodes)
        
        if (sku, node) in generated_pairs:
            continue
            
        generated_pairs.add((sku, node))
        unit_cost = master_catalog[sku]
        lead_time = random.randint(5, 14)
        
        # Determine the "Market State" for this specific warehouse
        state_roll = random.random()
        
        if state_roll < 0.25:
            # 25% Chance: DEAD STOCK (Needs to be transferred out)
            current_stock = random.randint(100, 350)
            daily_demand = 0
            days_stagnant = random.randint(60, 180)
            
        elif state_roll < 0.50:
            # 25% Chance: STOCKOUT RISK (Needs a transfer in)
            current_stock = random.randint(0, 5)
            daily_demand = random.randint(10, 40)
            days_stagnant = 0
            
        else:
            # 50% Chance: NORMAL OPERATIONS
            current_stock = random.randint(30, 80)
            daily_demand = random.randint(1, 8)
            days_stagnant = 0

        inventory_records.append([
            sku, node, unit_cost, current_stock, 
            daily_demand, days_stagnant, lead_time
        ])
        
    with open(inventory_filename, mode="w", newline="") as i_file:
        writer = csv.writer(i_file)
        writer.writerow([
            "SKU_ID", "Node_Location", "Unit_Cost", "Current_Stock", 
            "Daily_Demand", "Days_Stagnant", "Lead_Time_Days"
        ])
        writer.writerows(inventory_records)

    print(f"Generated {inventory_filename} successfully with 250 records.")

if __name__ == "__main__":
    generate_decoupled_datasets()