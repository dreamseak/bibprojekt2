# Deploy Bib Projekt to Railway (Free)

Railway is a free cloud platform that keeps your app online 24/7 at no cost.

## Prerequisites

1. **Git** - Install from https://git-scm.com/
2. **GitHub Account** - Create free account at https://github.com/
3. **Railway Account** - Create free account at https://railway.app/

## Step 1: Initialize Git Repository

Open PowerShell in your project folder and run:

```powershell
cd "c:\Users\Johannes\Downloads\Bib Projekt"
git init
git add .
git commit -m "Initial commit"
```

## Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository (e.g., "bib-projekt")
3. **Do NOT** initialize with README (we have files already)
4. Copy the commands GitHub shows and run them:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/bib-projekt.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` and `bib-projekt` with your values.

## Step 3: Deploy to Railway

1. Go to https://railway.app/
2. **Sign up** with your GitHub account
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your `bib-projekt` repository
5. Railway will automatically detect it's a Node.js app
6. Click **"Deploy"** and wait (takes 2-3 minutes)

## Step 4: Access Your App

Once deployed:
1. Go to your Railway project dashboard
2. Click the **"Domains"** tab
3. Copy the generated domain (looks like: `bib-projekt-production.up.railway.app`)
4. Open it in your browser - your app is now live!

## Important Notes

- **Database**: SQLite database is stored in the container. When Railway restarts, the database resets. For permanent data, upgrade to Railway's paid PostgreSQL database ($5/month)
- **Keep Running**: Railway keeps your app online 24/7 even when your computer is off
- **Free Tier**: 100 hours/month free (enough for most projects)

## Troubleshooting

### App won't start
- Check the **Logs** tab in Railway dashboard
- Make sure `backend/package.json` exists
- Verify `npm start` command works locally

### Can't access the domain
- Wait a few minutes after deployment
- Check the **Deployments** tab to see if build succeeded
- Refresh your browser

### Database keeps resetting
- This is normal for free tier
- To keep data permanently, add PostgreSQL database in Railway ($5/month)

## Going Deeper

To make your database permanent and add more features:
1. Add PostgreSQL to your Railway project
2. Update `backend/db.js` to use PostgreSQL instead of SQLite
3. This keeps your data safe between restarts

For now, the free tier with SQLite works great for testing!
