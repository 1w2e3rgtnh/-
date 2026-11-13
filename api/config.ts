import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

export default function handler(_req: IncomingMessage, res: VercelResponse) {
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const supabaseAnonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const isValid =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    (supabaseUrl.startsWith('https://') || supabaseUrl.startsWith('http://'));

  res.status(200).json({
    supabaseUrl: isValid ? supabaseUrl : '',
    supabaseAnonKey: isValid ? supabaseAnonKey : '',
  });
}
