# Maqsood Karyana Store

Mobile-first PWA for daily grocery purchases, paid/unpaid balances, item catalogue, history and analytics.

## Supabase

1. Create a new Supabase project.
2. Open SQL Editor.
3. In `supabase_setup.sql`, change the initial password `Maqsood123@`.
4. Run the complete SQL file once.
5. Open Project Settings > API.
6. Put Project URL and anon/publishable key in `config.js`.

Never put the `service_role` key in this app.

## GitHub and Vercel

Upload the files inside this folder to the root of a GitHub repository. Import that repository into Vercel. No build command is required because this is a static app.

## Login

The first login uses the password configured in `supabase_setup.sql`. A secure random session token remains valid for 7 days. Press Logout to end it immediately.

## Data and exports

- A new item name is automatically added to the searchable item dropdown.
- CSV downloads the currently filtered history.
- Print / PDF opens the browser print screen. On mobile or desktop choose **Save as PDF** for a PDF file.
- The app shell works offline, but saving/loading database records requires internet.
