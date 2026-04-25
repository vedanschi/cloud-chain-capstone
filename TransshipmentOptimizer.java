import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.*;

public class TransshipmentOptimizer {

    // Supply Chain Cost Constants
    private static final double ANNUAL_HOLDING_COST_PCT = 0.20;
    private static final double PROFIT_MARGIN_PCT = 0.30;
    private static final double BASE_FREIGHT_COST = 50.0;
    private static final double RATE_PER_MILE = 0.15;
    private static final double HANDLING_FEE = 20.0;
    private static final int ORIGIN_SAFETY_STOCK_BUFFER = 10;

    // In-Memory Data Stores
    private static Map<String, Map<String, Double>> distanceMatrix = new HashMap<>();
    private static List<InventoryRecord> inventoryState = new ArrayList<>();

    public static void main(String[] args) {
        System.out.println("Initializing D.L.T. Network Optimizer...\n");
        
        loadDistanceMatrix("network_distances.csv");
        loadInventoryState("inventory_state.csv");

        // Let's run a network-wide sweep to find and solve one critical issue.
        runNetworkSweepDemo();
    }

    // --- PHASE 1: DATA INGESTION --- //

    public static void loadDistanceMatrix(String filePath) {
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            br.readLine(); // Skip header
            String line;
            while ((line = br.readLine()) != null) {
                String[] data = line.split(",");
                String origin = data[0];
                String dest = data[1];
                double distance = Double.parseDouble(data[2]);

                distanceMatrix.putIfAbsent(origin, new HashMap<>());
                distanceMatrix.get(origin).put(dest, distance);
            }
            System.out.println("[SYS] Distance Matrix Loaded.");
        } catch (IOException e) {
            System.err.println("Error loading distances: " + e.getMessage());
        }
    }

    public static void loadInventoryState(String filePath) {
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            br.readLine(); // Skip header
            String line;
            while ((line = br.readLine()) != null) {
                String[] data = line.split(",");
                inventoryState.add(new InventoryRecord(
                    data[0], data[1], Double.parseDouble(data[2]), 
                    Integer.parseInt(data[3]), Integer.parseInt(data[4]), 
                    Integer.parseInt(data[5]), Integer.parseInt(data[6])
                ));
            }
            System.out.println("[SYS] Live Inventory State Loaded (" + inventoryState.size() + " records).\n");
        } catch (IOException e) {
            System.err.println("Error loading inventory: " + e.getMessage());
        }
    }

    // --- PHASE 2: THE 1-TO-N OPTIMIZATION ENGINE --- //

    public static void runNetworkSweepDemo() {
        System.out.println("=== INITIATING NETWORK SWEEP ===\n");
        
        // Find the most critical stagnant item in the network (e.g., stagnant > 90 days)
        InventoryRecord criticalOrigin = inventoryState.stream()
                .filter(record -> record.daysStagnant > 90 && record.currentStock > ORIGIN_SAFETY_STOCK_BUFFER)
                .findFirst()
                .orElse(null);

        if (criticalOrigin == null) {
            System.out.println("Network is healthy. No critical dead stock detected.");
            return;
        }

        System.out.println("CRITICAL ASSET DETECTED:");
        System.out.println("SKU: " + criticalOrigin.sku + " | Location: " + criticalOrigin.node + " | Stagnant: " + criticalOrigin.daysStagnant + " days");
        System.out.println("Executing Network Search for Deficits...\n");

        List<RouteDecision> viableRoutes = new ArrayList<>();

        // 1. Calculate the Penalty of Inaction at the Origin
        double accumulatedHoldingCost = (criticalOrigin.unitCost * ANNUAL_HOLDING_COST_PCT) * (criticalOrigin.daysStagnant / 365.0);
        double costOfLostSale = criticalOrigin.unitCost * PROFIT_MARGIN_PCT;
        double totalCostOfInaction = accumulatedHoldingCost + costOfLostSale;
        int originSurplus = criticalOrigin.currentStock - ORIGIN_SAFETY_STOCK_BUFFER;

        // 2. Scan every other node in the network for this specific SKU
        for (InventoryRecord destRecord : inventoryState) {
            if (destRecord.sku.equals(criticalOrigin.sku) && !destRecord.node.equals(criticalOrigin.node)) {
                
                double reorderPoint = (destRecord.dailyDemand * destRecord.leadTime) * 1.2;
                
                // If the destination is facing a stockout, calculate the math
                if (destRecord.currentStock <= reorderPoint) {
                    double distance = distanceMatrix.get(criticalOrigin.node).get(destRecord.node);
                    double totalFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;

                    // If moving it is cheaper than doing nothing, it's a viable route
                    if (totalCostOfInaction > totalFreightCost) {
                        int destDeficit = (int) Math.ceil(reorderPoint - destRecord.currentStock);
                        int transferQuantity = Math.min(originSurplus, destDeficit);

                        if (transferQuantity > 0) {
                            double netSavings = totalCostOfInaction - totalFreightCost;
                            viableRoutes.add(new RouteDecision(destRecord.node, distance, transferQuantity, netSavings));
                        }
                    }
                }
            }
        }

        // 3. Rank the Results and Output the Optimal Decision
        if (viableRoutes.isEmpty()) {
            System.out.println("[RESULT] Action Rejected. No profitable destinations found for " + criticalOrigin.sku);
        } else {
            // Sort by highest net savings
            viableRoutes.sort((r1, r2) -> Double.compare(r2.netSavings, r1.netSavings));

            System.out.println("--- VIABLE ROUTES DISCOVERED ---");
            for (RouteDecision route : viableRoutes) {
                System.out.printf("Route to %s (%.0f miles) -> Projected Savings: $%.2f\n", route.destinationNode, route.distanceMiles, route.netSavings);
            }

            RouteDecision optimalRoute = viableRoutes.get(0);
            System.out.println("\n[SYSTEM DECISION] OPTIMAL ROUTE AUTHORIZED");
            System.out.printf("Transfer %d units of %s from %s to %s.\n", 
                optimalRoute.transferQuantity, criticalOrigin.sku, criticalOrigin.node, optimalRoute.destinationNode);
            System.out.printf("Total Network Savings: $%.2f\n", optimalRoute.netSavings);
        }
    }

    // --- DATA MODELS --- //

    static class InventoryRecord {
        String sku, node;
        double unitCost;
        int currentStock, dailyDemand, daysStagnant, leadTime;

        public InventoryRecord(String sku, String node, double unitCost, int currentStock, int dailyDemand, int daysStagnant, int leadTime) {
            this.sku = sku; this.node = node; this.unitCost = unitCost;
            this.currentStock = currentStock; this.dailyDemand = dailyDemand;
            this.daysStagnant = daysStagnant; this.leadTime = leadTime;
        }
    }

    static class RouteDecision {
        String destinationNode;
        double distanceMiles;
        int transferQuantity;
        double netSavings;

        public RouteDecision(String destinationNode, double distanceMiles, int transferQuantity, double netSavings) {
            this.destinationNode = destinationNode;
            this.distanceMiles = distanceMiles;
            this.transferQuantity = transferQuantity;
            this.netSavings = netSavings;
        }
    }
}