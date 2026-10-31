-- Add expiry_date column to products table if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;
