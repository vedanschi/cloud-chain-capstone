import io.javalin.Javalin;
import com.google.gson.Gson;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.*;

public class TransshipmentOptimizer {

    private static final double ANNUAL_HOLDING_COST_PCT = 0.20;
    private static final double PROFIT_MARGIN_PCT = 0.30;
    private static final double BASE_FREIGHT_COST = 50.0;
    private static final double RATE_PER_MILE = 0.15;
    private static final double HANDLING_FEE = 20.0;
    private static final int ORIGIN_SAFETY_STOCK_BUFFER = 10;

    private static Map<String, Map<String, Double>> distanceMatrix = new HashMap<>();
    private static List<InventoryRecord> inventoryState = new ArrayList<>();

    public static void main(String[] args) {
        // Load data on startup
        loadDistanceMatrix("network_distances.csv");
        loadInventoryState("inventory_state.csv");

        // Render assigns a dynamic port via environment variables
        int port = System.getenv("PORT") != null ? Integer.parseInt(System.getenv("PORT")) : 7070;

        // Initialize Web Server
        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> cors.addRule(it -> it.anyHost()));
        }).start(port);

        System.out.println("API running on port " + port);

        // The API Endpoint
        app.get("/api/optimize", ctx -> {
            String targetSku = ctx.queryParam("sku");
            String originNode = ctx.queryParam("origin");
            double targetCost = Double.parseDouble(ctx.queryParam("cost"));
            int targetStock = Integer.parseInt(ctx.queryParam("stock"));
            int targetStagnant = Integer.parseInt(ctx.queryParam("stagnant"));

            OptimizationResult response = runOptimizationEngine(targetSku, originNode, targetCost, targetStock, targetStagnant);
            
            Gson gson = new Gson();
            ctx.json(gson.toJson(response));
        });
    }

    public static OptimizationResult runOptimizationEngine(String sku, String originNode, double unitCost, int originStock, int daysStagnant) {
        OptimizationResult result = new OptimizationResult();
        
        double accumulatedHoldingCost = (unitCost * ANNUAL_HOLDING_COST_PCT) * (daysStagnant / 365.0);
        double costOfLostSale = unitCost * PROFIT_MARGIN_PCT;
        double totalCostOfInaction = accumulatedHoldingCost + costOfLostSale;
        int originSurplus = originStock - ORIGIN_SAFETY_STOCK_BUFFER;

        for (InventoryRecord dest : inventoryState) {
            if (dest.sku.equals(sku) && !dest.node.equals(originNode)) {
                double reorderPoint = (dest.dailyDemand * dest.leadTime) * 1.2;
                
                if (dest.currentStock <= reorderPoint && dest.dailyDemand > 0) {
                    double distance = distanceMatrix.getOrDefault(originNode, new HashMap<>()).getOrDefault(dest.node, 9999.0);
                    double totalFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;

                    if (totalCostOfInaction > totalFreightCost) {
                        int destDeficit = (int) Math.ceil(reorderPoint - dest.currentStock);
                        int transferQuantity = Math.min(originSurplus, destDeficit);
                        double netSavings = totalCostOfInaction - totalFreightCost;

                        if (transferQuantity > 0) {
                            result.viableRoutes.add(new RouteDecision(dest.node, distance, transferQuantity, netSavings));
                        }
                    }
                }
            }
        }

        if (!result.viableRoutes.isEmpty()) {
            result.viableRoutes.sort((r1, r2) -> Double.compare(r2.netSavings, r1.netSavings));
            result.winner = result.viableRoutes.get(0);
            result.success = true;
        }

        return result;
    }

    // --- Data Loaders & Models ---
    public static void loadDistanceMatrix(String filePath) {
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            br.readLine(); 
            String line;
            while ((line = br.readLine()) != null) {
                String[] data = line.split(",");
                distanceMatrix.computeIfAbsent(data[0], k -> new HashMap<>()).put(data[1], Double.parseDouble(data[2]));
            }
        } catch (IOException e) { System.out.println("No distance file found, continuing."); }
    }

    public static void loadInventoryState(String filePath) {
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            br.readLine();
            String line;
            while ((line = br.readLine()) != null) {
                String[] data = line.split(",");
                inventoryState.add(new InventoryRecord(data[0], data[1], Double.parseDouble(data[2]), Integer.parseInt(data[3]), Integer.parseInt(data[4]), Integer.parseInt(data[5]), Integer.parseInt(data[6])));
            }
        } catch (IOException e) { System.out.println("No inventory file found, continuing."); }
    }

    static class InventoryRecord {
        String sku, node; double unitCost; int currentStock, dailyDemand, daysStagnant, leadTime;
        public InventoryRecord(String s, String n, double u, int c, int d, int ds, int lt) {
            sku = s; node = n; unitCost = u; currentStock = c; dailyDemand = d; daysStagnant = ds; leadTime = lt;
        }
    }

    static class RouteDecision {
        String destinationNode; double distanceMiles, netSavings; int transferQuantity;
        public RouteDecision(String d, double dist, int t, double s) { destinationNode = d; distanceMiles = dist; transferQuantity = t; netSavings = s; }
    }

    static class OptimizationResult {
        boolean success = false;
        RouteDecision winner = null;
        List<RouteDecision> viableRoutes = new ArrayList<>();
    }
}
