
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://cxnktrfpqjjkdfmiyhdz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bmt0cmZwcWpqa2RmbWl5aGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyNDAyNDksImV4cCI6MjA1NDgxNjI0OX0.GwEFcZ0mI8xuZs1hGJgz8R2zp13cLJIbtu6ZY2nDeTU";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
