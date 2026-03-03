-- Run this in Supabase SQL Editor
-- https://supabase.com → project → SQL Editor

-- Members
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#f0b429',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily rounds
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match pairs within a round
CREATE TABLE pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  p1_id UUID NOT NULL REFERENCES members(id),
  p2_id UUID REFERENCES members(id),          -- NULL if bye
  result TEXT CHECK (result IN ('p1', 'p2', 'draw')),
  is_bye BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS (internal tool — access controlled via service key in backend)
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE rounds  DISABLE ROW LEVEL SECURITY;
ALTER TABLE pairs   DISABLE ROW LEVEL SECURITY;
