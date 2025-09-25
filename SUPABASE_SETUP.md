# Supabase Setup Guide

## 🚀 Supabase Migratie

Deze applicatie is nu geconfigureerd om Supabase te gebruiken in plaats van Turso. Supabase biedt een krachtigere PostgreSQL database met real-time functionaliteiten.

## 📋 Stap 1: Supabase Project Aanmaken

1. Ga naar [supabase.com](https://supabase.com)
2. Klik op "Start your project"
3. Log in met je GitHub account
4. Klik op "New Project"
5. Kies een organisatie
6. Vul de project details in:
   - **Name**: `lightspeed-import`
   - **Database Password**: Kies een sterk wachtwoord
   - **Region**: Europe West (Amsterdam) - voor beste performance in Nederland
7. Klik op "Create new project"

## 🔑 Stap 2: Credentials Ophalen

1. Ga naar je project dashboard
2. Klik op "Settings" in de sidebar
3. Klik op "API"
4. Kopieer de volgende waarden:
   - **Project URL** (bijv. `https://abcdefgh.supabase.co`)
   - **anon public** key
   - **service_role** key (optioneel, voor admin operaties)

## ⚙️ Stap 3: Environment Variables Configureren

Maak een `.env` bestand in de `backend` directory:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application Configuration
NODE_ENV=production
PORT=4000
```

## 🗄️ Stap 4: Database Schema Installeren

1. Ga naar je Supabase project dashboard
2. Klik op "SQL Editor" in de sidebar
3. Klik op "New query"
4. Kopieer de inhoud van `backend/db/schema.sql`
5. Plak het in de SQL editor
6. Klik op "Run" om het schema te installeren

## 🔄 Stap 5: Data Migreren

Run het migratie script:

```bash
cd backend
node migrate-to-supabase.js
```

## ✅ Stap 6: Testen

1. Start de applicatie:
   ```bash
   node start-app.js
   ```

2. Ga naar `http://localhost:3000`
3. Test alle functionaliteiten:
   - Dashboard overzicht
   - Product Manager
   - Import functionaliteiten
   - Brand filtering

## 🎯 Voordelen van Supabase

- **PostgreSQL**: Krachtigere database dan SQLite
- **Real-time**: Live updates mogelijk
- **Dashboard**: Visuele database management
- **REST API**: Automatisch gegenereerde API endpoints
- **Authentication**: Built-in gebruikersbeheer
- **Storage**: File storage voor afbeeldingen
- **Edge Functions**: Serverless functions

## 🔧 Troubleshooting

### Connection Issues
- Controleer of de SUPABASE_URL correct is
- Controleer of de SUPABASE_ANON_KEY correct is
- Controleer of het project actief is

### Schema Issues
- Controleer of alle tabellen zijn aangemaakt
- Controleer of de `execute_sql` functie bestaat
- Controleer de database logs in Supabase dashboard

### Performance Issues
- Controleer of de juiste indexes zijn aangemaakt
- Overweeg connection pooling voor hoge load
- Monitor query performance in Supabase dashboard

## 📊 Monitoring

- **Database**: Ga naar "Table Editor" in Supabase dashboard
- **Logs**: Ga naar "Logs" in Supabase dashboard
- **Metrics**: Ga naar "Reports" in Supabase dashboard

## 🔒 Security

- Gebruik de `anon` key voor frontend operaties
- Gebruik de `service_role` key alleen voor backend operaties
- Configureer Row Level Security (RLS) indien nodig
- Monitor API usage in het Supabase dashboard


