-- 01_schema_and_rls.sql
-- Gym Streak - Schema completo + Row Level Security

-------------------------------------------------------
-- PROFILES (estrutura real do banco)
-------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  username TEXT,
  avatar_url TEXT,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-------------------------------------------------------
-- GOALS (nunca deletar, só desativar)
-------------------------------------------------------
CREATE TABLE public.goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own goals"
  ON goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-------------------------------------------------------
-- GOAL COMPLETIONS (escrita só via função)
-------------------------------------------------------
CREATE TABLE public.goal_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT (timezone('America/Sao_Paulo'::text, now()))::date,
  UNIQUE(goal_id, date)
);

ALTER TABLE goal_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own completions"
  ON goal_completions FOR SELECT USING (auth.uid() = user_id);
-- SEM policy de INSERT/UPDATE/DELETE: escrita apenas via funções security definer

-------------------------------------------------------
-- DAILY CHECKINS (escrita só via função)
-------------------------------------------------------
CREATE TABLE public.daily_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT (timezone('America/Sao_Paulo'::text, now()))::date,
  UNIQUE(user_id, date)
);

ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own checkins"
  ON daily_checkins FOR SELECT USING (auth.uid() = user_id);
-- SEM policy de INSERT/UPDATE/DELETE: escrita apenas via funções security definer

-------------------------------------------------------
-- GROUPS
-------------------------------------------------------
CREATE TABLE public.groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ver grupos (necessário para validar invite_code)
CREATE POLICY "Anyone can view groups"
  ON groups FOR SELECT USING (true);

-------------------------------------------------------
-- GROUP MEMBERS
-------------------------------------------------------
CREATE TABLE public.group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Helper function para evitar recursão de policy
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE POLICY "Members can view group members"
  ON group_members FOR SELECT USING (is_group_member(group_id));
-- SEM policy de INSERT/DELETE direto: escrita via funções
