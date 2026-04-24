public class TransshipmentEngine {

    // Supply Chain Cost Constants
    private static final double ANNUAL_HOLDING_COST_PCT = 0.20;
    private static final double PROFIT_MARGIN_PCT = 0.30;
    private static final double BASE_FREIGHT_COST = 50.0;
    private static final double RATE_PER_MILE = 0.15;
    private static final double HANDLING_FEE = 20.0;
    private static final int ORIGIN_SAFETY_STOCK_BUFFER = 10; 

    public static void main(String[] args) {
        System.out.println("Initializing Logistics Decision Engine...\n");

        // Test Scenario 1: Profitable Transfer (High Stagnation, Short Distance)
        evaluateTransfer("ITEM-1001", 150.00, 100, 200, 2, 15, 120, 7);

        // Test Scenario 2: Freight Barrier (High Distance blocks transfer)
        evaluateTransfer("ITEM-8842", 150.00, 2500, 200, 2, 15, 120, 7);
    }

    public static void evaluateTransfer(String sku, double unitCost, double distanceMiles, 
                                        int originOnHand, int destOnHand, int destDailyDemand, 
                                        int daysStagnant, int leadTimeDays) {
        
        System.out.println("Evaluating SKU: " + sku + " | Distance: " + distanceMiles + " miles");

        // 1. Calculate Financial Tipping Point
        double accumulatedHoldingCost = (unitCost * ANNUAL_HOLDING_COST_PCT) * (daysStagnant / 365.0);
        double costOfLostSale = unitCost * PROFIT_MARGIN_PCT;
        double totalCostOfInaction = accumulatedHoldingCost + costOfLostSale;
        double totalFreightCost = BASE_FREIGHT_COST + (distanceMiles * RATE_PER_MILE) + HANDLING_FEE;

        boolean isFinanciallyViable = totalCostOfInaction > totalFreightCost;

        // 2. Calculate Inventory Constraints and Triggers
        double reorderPoint = (destDailyDemand * leadTimeDays) * 1.2; // Includes 20% safety stock buffer
        boolean isStockoutImminent = destOnHand <= reorderPoint;

        int originSurplus = originOnHand - ORIGIN_SAFETY_STOCK_BUFFER;
        int destDeficit = (int) Math.ceil(reorderPoint - destOnHand);
        int transferQuantity = Math.min(originSurplus, destDeficit);

        // 3. Final Decision Logic
        if (isFinanciallyViable && isStockoutImminent && transferQuantity > 0) {
            double netSavings = totalCostOfInaction - totalFreightCost;
            System.out.println("[RESULT] ACTION: AUTHORIZED");
            System.out.println("Transfer Quantity: " + transferQuantity + " units");
            System.out.printf("Estimated Network Savings: $%.2f\n\n", netSavings);
        } else {
            System.out.println("[RESULT] ACTION: REJECTED (HOLD ASSET)");
            if (!isFinanciallyViable) {
                System.out.println("Reason: Freight cost exceeds inaction penalty.");
            } else if (!isStockoutImminent) {
                System.out.println("Reason: Destination inventory remains above Reorder Point.");
            } else {
                System.out.println("Reason: Insufficient surplus at Origin node.");
            }
            System.out.println();
        }
    }
}
