import { createClient } from '@supabase/supabase-js';
export type {
  ActionHistory,
  Dataset,
  DemographicColumn,
  InterpretationBand,
  Project,
  ResponseScale,
  ScoringResultDB,
  SubscaleGroup,
  SubscaleItem,
  Template,
  TemplateDefinition,
} from '@/types/domain';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
