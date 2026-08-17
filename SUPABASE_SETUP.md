# Supabase setup for this project

- Create a table using the SQL file: `sql/oligopoly_rooms.sql`.
- Create a Storage bucket named `avatars` for player avatars.
  - If you want public avatar URLs, set the bucket to public read.
  - Alternatively, keep the bucket private and use `createSignedUrl` for access.

- Add these Vite env variables in a `.env` file at the project root:

  VITE_SUPABASE_URL=your-supabase-url
  VITE_SUPABASE_ANON_KEY=your-anon-key

- Restart the dev server after adding env vars.

- Security notes:
  - The example uses the publishable anon key to allow casual play without auth.
  - For production or sensitive data, enable auth and tighten RLS policies.
