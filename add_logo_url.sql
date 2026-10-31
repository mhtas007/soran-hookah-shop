-- Migration to add logo_url and receipt_header to settings table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'logo_url'
    ) THEN
        ALTER TABLE settings ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'receipt_header'
    ) THEN
        ALTER TABLE settings ADD COLUMN receipt_header TEXT;
    END IF;
END $$;
