-- ===================================================
-- Supabase PostgreSQL Schema for MoneyFlow Tracker
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ===================================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Accounts table (scoped to user)
CREATE TABLE IF NOT EXISTS public.accounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, user_id)
);

-- 3. Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#7c6af7',
  icon TEXT DEFAULT '📌',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  account_id BIGINT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES public.categories(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Budgets table
CREATE TABLE IF NOT EXISTS public.budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES public.categories(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  period TEXT DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly', 'yearly')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Recurring Transactions table
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES public.categories(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Insert default categories if not already present
INSERT INTO public.categories (name, color, icon) VALUES
  ('Food & Dining', '#f76a8a', '🍔'),
  ('Transportation', '#7c6af7', '🚗'),
  ('Shopping', '#5ef5c0', '🛍️'),
  ('Entertainment', '#fbbf24', '🎮'),
  ('Bills & Utilities', '#ef4444', '💡'),
  ('Healthcare', '#10b981', '🏥'),
  ('Salary', '#22c55e', '💰'),
  ('Investment', '#8b5cf6', '📈'),
  ('Education', '#06b6d4', '📚'),
  ('Travel', '#f59e0b', '✈️')
ON CONFLICT (name) DO NOTHING;
