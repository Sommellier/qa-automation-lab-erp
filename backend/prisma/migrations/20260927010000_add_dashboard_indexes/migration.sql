CREATE INDEX "clients_active_idx" ON "clients"("active");
CREATE INDEX "products_active_stock_idx" ON "products"("active", "stock");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
