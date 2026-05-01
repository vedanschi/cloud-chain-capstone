import java.util.ArrayList;
import java.util.List;

public class LogisticsModels {

    // 1. Represents a single row from your Supabase inventory_state table
    public static class InventoryRecord {
        public String sku;
        public String node;
        public double unitCost;
        public int currentStock;
        public int dailyDemand;
        public int daysStagnant;
        public int leadTime;

        public InventoryRecord(String sku, String node, double unitCost, int currentStock, int dailyDemand, int daysStagnant, int leadTime) {
            this.sku = sku;
            this.node = node;
            this.unitCost = unitCost;
            this.currentStock = currentStock;
            this.dailyDemand = dailyDemand;
            this.daysStagnant = daysStagnant;
            this.leadTime = leadTime;
        }
    }

    // 2. Represents the financial math and logistics of a specific lateral move
    public static class RouteDecision {
        public String destinationNode;
        public double distanceMiles;
        public int transferQuantity;
        public double netSavings;

        public RouteDecision(String destinationNode, double distanceMiles, int transferQuantity, double netSavings) {
            this.destinationNode = destinationNode;
            this.distanceMiles = distanceMiles;
            this.transferQuantity = transferQuantity;
            this.netSavings = netSavings;
        }
    }

    // 3. Represents the final algorithmic conclusion sent back to the dashboard
    public static class OptimizationResult {
        public boolean success = false;
        public RouteDecision winner = null;
        public List<RouteDecision> viableRoutes = new ArrayList<>();
    }
}