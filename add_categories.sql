CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT 'bg-blue-100 text-blue-700',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrate existing unique string categories from products
INSERT INTO categories (name)
SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;

-- Grant permissions to public/authenticated (similar to other tables)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON categories FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON categories FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON categories FOR DELETE USING (true);
