-- Create whiteboards table for storing user canvas state
CREATE TABLE IF NOT EXISTS whiteboards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  graph_state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own whiteboard
CREATE POLICY "Users can access their own whiteboard"
  ON whiteboards
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS whiteboards_user_id_idx ON whiteboards(user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on updates
CREATE TRIGGER update_whiteboards_updated_at
  BEFORE UPDATE ON whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
