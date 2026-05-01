import java.util.*;

public class OptimizationEngine {

    // Logistics Economic Constants
    private static final double ANNUAL_HOLDING_COST_PCT = 0.20;
    private static final double PROFIT_MARGIN_PCT = 0.30;
    private static final double BASE_FREIGHT_COST = 50.0;
    private static final double RATE_PER_MILE = 0.15;
    private static final double HANDLING_FEE = 20.0;
    private static final int SAFETY_STOCK_BUFFER = 10;
    private static final double CENTRAL_WAREHOUSE_FREIGHT = 120.0;

    public static LogisticsModels.OptimizationResult runGlobalEngine(String sku, String lockedNode, double unitCost, int stock, int stagnant, String manualTarget, String mode) {
        LogisticsModels.OptimizationResult result = new LogisticsModels.OptimizationResult();
        List<LogisticsModels.InventoryRecord> inventory = DatabaseManager.getInventoryState();
        Map<String, Map<String, Double>> distanceMatrix = DatabaseManager.getDistanceMatrix();

        double costOfLostSale = unitCost * PROFIT_MARGIN_PCT;
        double originHoldingCost = (unitCost * ANNUAL_HOLDING_COST_PCT) * (stagnant / 365.0);

        // ------------------------------------------------------------------------
        // PUSH MODE (or Unrestricted Normal Transfer Out)
        // Objective: Find a destination node that needs this stock to prevent a lost sale.
        // ------------------------------------------------------------------------
        if ("PUSH".equalsIgnoreCase(mode) || "NORMAL".equalsIgnoreCase(mode)) {
            int surplus = Math.max(0, stock - SAFETY_STOCK_BUFFER);
            if ("NORMAL".equalsIgnoreCase(mode)) surplus = stock; // Unrestricted fluidity

            double totalCostOfInaction = originHoldingCost + costOfLostSale;

            for (LogisticsModels.InventoryRecord dest : inventory) {
                if (dest.sku.equals(sku) && !dest.node.equals(lockedNode)) {
                    
                    double reorderPoint = (dest.dailyDemand * dest.leadTime) * 1.2;
                    
                    // We evaluate if destination mathematically needs it, OR if it's the user's manual target
                    boolean isDestinationInNeed = (dest.currentStock <= reorderPoint && dest.dailyDemand > 0);
                    boolean isManualTarget = dest.node.equals(manualTarget);

                    if (isDestinationInNeed || isManualTarget) {
                        double distance = getDistance(distanceMatrix, lockedNode, dest.node);
                        double totalFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;

                        // Tipping Point Calculation
                        double netSavings = totalCostOfInaction - totalFreightCost;
                        
                        int destDeficit = isDestinationInNeed ? (int) Math.ceil(reorderPoint - dest.currentStock) : 50;
                        int transferQuantity = Math.min(surplus, destDeficit);

                        if (transferQuantity > 0) {
                            result.viableRoutes.add(new LogisticsModels.RouteDecision(dest.node, distance, transferQuantity, netSavings));
                        }
                    }
                }
            }
        } 
        
        // ------------------------------------------------------------------------
        // PULL MODE
        // Objective: Find an origin node with surplus to pull from, avoiding new capital expenditure.
        // ------------------------------------------------------------------------
        else if ("PULL".equalsIgnoreCase(mode)) {
            // Baseline: Vertical Replenishment (Central Warehouse)
            double cwPenalty = CENTRAL_WAREHOUSE_FREIGHT + unitCost; // Freight + Capital Expenditure for a NEW unit
            result.viableRoutes.add(new LogisticsModels.RouteDecision("Central Warehouse", 0.0, 50, 0.0));

            for (LogisticsModels.InventoryRecord origin : inventory) {
                if (origin.sku.equals(sku) && !origin.node.equals(lockedNode)) {
                    
                    int surplus = origin.currentStock - SAFETY_STOCK_BUFFER;
                    boolean hasSurplus = surplus > 0;
                    boolean isManualTarget = origin.node.equals(manualTarget);

                    // Allow pull if peer has surplus, OR if user forced it (unrestricted fluidity)
                    if (hasSurplus || isManualTarget) {
                        double distance = getDistance(distanceMatrix, origin.node, lockedNode);
                        double lateralFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;
                        
                        // Holding cost relieved at the origin node
                        double peerHoldingCostSaved = (unitCost * ANNUAL_HOLDING_COST_PCT) * (origin.daysStagnant / 365.0);
                        
                        // The true cost of the lateral move
                        double lateralNetCost = lateralFreightCost - peerHoldingCostSaved;

                        // Net Savings compared to buying new from Central Warehouse
                        double netSavings = cwPenalty - lateralNetCost;

                        int transferQuantity = Math.max(1, Math.min(surplus, 50)); 
                        result.viableRoutes.add(new LogisticsModels.RouteDecision(origin.node, distance, transferQuantity, netSavings));
                    }
                }
            }
        }

        // ------------------------------------------------------------------------
        // ROUTE RESOLUTION
        // ------------------------------------------------------------------------
        if (!result.viableRoutes.isEmpty()) {
            // Sort descending by Net Savings to find the absolute mathematical optimum
            result.viableRoutes.sort((r1, r2) -> Double.compare(r2.netSavings, r1.netSavings));
            result.winner = result.viableRoutes.get(0);
            result.success = true;
        }

        return result;
    }

    // Safe distance lookup helper
    private static double getDistance(Map<String, Map<String, Double>> matrix, String from, String to) {
        if (matrix.containsKey(from) && matrix.get(from).containsKey(to)) {
            return matrix.get(from).get(to);
        }
        if (matrix.containsKey(to) && matrix.get(to).containsKey(from)) {
            return matrix.get(to).get(from); // check reverse direction
        }
        return 9999.0; // Fallback penalty for missing route data
    }
}