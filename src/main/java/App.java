import io.javalin.Javalin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

public class App {

    public static void main(String[] args) {
        System.out.println("Initializing DLT Cloud Controller...");
        
        // Initial data sync on startup
        DatabaseManager.syncDataFromCloud();

        int port = System.getenv("PORT") != null ? Integer.parseInt(System.getenv("PORT")) : 7070;

        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> cors.addRule(it -> it.anyHost()));
        }).start(port);

        System.out.println("API successfully running on port " + port);
        Gson gson = new Gson();

        // ENDPOINT: Fetch Live Inventory for the Dashboard
        app.get("/api/inventory", ctx -> {
            DatabaseManager.syncDataFromCloud(); // Always fetch freshest data
            ctx.json(gson.toJson(DatabaseManager.getInventoryState()));
        });

        // ENDPOINT: Run the Optimization Engine
        app.get("/api/optimize", ctx -> {
            String targetSku = ctx.queryParam("sku");
            String originNode = ctx.queryParam("origin");
            double targetCost = Double.parseDouble(ctx.queryParam("cost"));
            int targetStock = Integer.parseInt(ctx.queryParam("stock"));
            int targetStagnant = Integer.parseInt(ctx.queryParam("stagnant"));
            String targetNode = ctx.queryParam("targetNode");
            String mode = ctx.queryParam("mode");

            LogisticsModels.OptimizationResult response = OptimizationEngine.runGlobalEngine(
                targetSku, originNode, targetCost, targetStock, targetStagnant, targetNode, mode
            );
            ctx.json(gson.toJson(response));
        });

        // ENDPOINT: Execute Transfer & Write to Database
        app.post("/api/transfer", ctx -> {
            JsonObject body = gson.fromJson(ctx.body(), JsonObject.class);
            String sku = body.get("sku").getAsString();
            String origin = body.get("origin").getAsString();
            String destination = body.get("destination").getAsString();
            int qty = body.get("quantity").getAsInt();
            String type = body.get("type").getAsString();
            double savings = body.get("netSavings").getAsDouble();
            double cost = body.get("unitCost").getAsDouble();

            boolean success = DatabaseManager.executeCloudTransaction(
                sku, origin, destination, qty, type, savings, cost
            );
            
            if (success) {
                DatabaseManager.syncDataFromCloud(); // Resync memory state after DB write
                ctx.status(200).json("{\"status\":\"success\"}");
            } else {
                ctx.status(500).json("{\"status\":\"database_error\"}");
            }
        });
    }
}