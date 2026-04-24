import csv
import random
from datetime import datetime, timedelta

def generate_mock_logistics_data(filename="mock_logistics_data.csv"):
    headers = [
        "Date", "SKU_ID", "Unit_Cost", "Origin_Node", "Destination_Node",
        "Distance_Miles", "Origin_On_Hand", "Dest_On_Hand",
        "Dest_Daily_Demand", "Days_Stagnant", "Lead_Time_Days"
    ]
    
    nodes = ["Node-North", "Node-South", "Node-East", "Node-West", "Node-Central"]
    base_date = datetime(2026, 5, 1)
    
    with open(filename, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        
        for i in range(1, 51):
            date_str = (base_date + timedelta(days=i%5)).strftime("%Y-%m-%d")
            sku = f"ITEM-{random.randint(1000, 9999)}"
            unit_cost = round(random.uniform(50.0, 500.0), 2)
            
            origin = random.choice(nodes)
            dest = random.choice([n for n in nodes if n != origin])
            
            if i <= 5:
                distance = random.randint(50, 150)
                origin_stock = random.randint(100, 300)
                dest_stock = random.randint(0, 5)
                demand = random.randint(10, 20)
                stagnant = random.randint(90, 150)
                lead_time = random.randint(10, 14)
            elif i <= 10:
                distance = random.randint(2000, 3000)
                origin_stock = random.randint(100, 300)
                dest_stock = random.randint(0, 5)
                demand = random.randint(5, 10)
                stagnant = random.randint(30, 60)
                lead_time = random.randint(7, 10)
            elif i <= 15:
                distance = random.randint(100, 300)
                origin_stock = random.randint(15, 25) 
                dest_stock = random.randint(0, 2)
                demand = random.randint(10, 15)
                stagnant = random.randint(10, 20)
                lead_time = random.randint(7, 14)
            else:
                distance = random.randint(100, 1500)
                origin_stock = random.randint(30, 200)
                dest_stock = random.randint(0, 50)
                demand = random.randint(1, 20)
                stagnant = random.randint(5, 120)
                lead_time = random.randint(5, 14)
                
            writer.writerow([
                date_str, sku, unit_cost, origin, dest,
                distance, origin_stock, dest_stock,
                demand, stagnant, lead_time
            ])

if __name__ == "__main__":
    generate_mock_logistics_data()
    print("Mock dataset generated successfully.")
