# Restore after deleting and re-forking ts-portal-gmu

Use this after you delete the GitHub repo `theirstory/ts-portal-gmu`, create a new fork of `ts-portal` named `ts-portal-gmu`, and want to restore this project (local + droplet).

---

## Step 1: Create the backup (do this first)

From the repo root:

```bash
./scripts/backup-for-repo-recreate.sh
```

This creates a folder like `ts-portal-gmu-backup-20250221-143000` with:

- `public/` and `json/` (if they exist)
- `config.json`, `.env.local`, `.env.cloud`, etc. (if they exist)
- `weaviate-data.tar.gz` (if present)
- `repo-main.bundle` (or your current branch) — full git history

Keep this folder **outside** the repo or copy it somewhere safe (e.g. Desktop). Do not commit it.

---

## Step 2: Delete the GitHub repo and create the new fork

1. **Delete** the existing `ts-portal-gmu` repo on GitHub:
   - Go to https://github.com/theirstory/ts-portal-gmu/settings
   - Scroll to **Danger Zone** → **Delete this repository**
   - Type the repo name and confirm

2. **Create the new fork:**
   - Go to https://github.com/theirstory/ts-portal
   - Click **Fork**
   - Owner: `theirstory`, Repository name: **ts-portal-gmu**
   - Create the fork

The new repo will have the same URL: `https://github.com/theirstory/ts-portal-gmu.git`

---

## Step 3: Point this project at the new repo and push your code

Your local repo still has all your commits. The new GitHub repo is a fresh fork of ts-portal. We’ll make the new repo match your local branch (and re-establish the fork link).

From your **local** repo root (e.g. `ts-portal-gmu`):

```bash
# Ensure origin points at the new repo (same URL after you re-create the fork)
git remote get-url origin
# Should be git@github.com:theirstory/ts-portal-gmu.git or https://github.com/theirstory/ts-portal-gmu.git

# Push your current branch and overwrite the new fork’s default branch with your history
git push origin main --force
# If your default branch has another name (e.g. master), use that instead of main
```

If the new fork’s default branch is `main`, that’s it. If GitHub created the fork with `master`, either rename the default branch on GitHub to `main` and push again, or push to `master`:

```bash
git push origin main:main --force
# or
git push origin main:master --force
```

Your local project is now back in sync with GitHub (new fork, same name, with your code).

---

## Step 4: Restore data on your local machine

From the backup folder (e.g. `ts-portal-gmu-backup-20250221-143000`), copy back into the repo root:

```bash
cd /path/to/ts-portal-gmu

# Restore data and config
cp -R ts-portal-gmu-backup-XXXXXX/public .   2>/dev/null || true
cp -R ts-portal-gmu-backup-XXXXXX/json .      2>/dev/null || true
cp ts-portal-gmu-backup-XXXXXX/config.json . 2>/dev/null || true
cp ts-portal-gmu-backup-XXXXXX/.env* .       2>/dev/null || true
cp ts-portal-gmu-backup-XXXXXX/weaviate-data.tar.gz . 2>/dev/null || true
```

Replace `ts-portal-gmu-backup-XXXXXX` with your actual backup folder name/path.

---

## Step 5: Droplet — backup, then sync to the new repo

SSH into the droplet and go to the app directory (e.g. `/root/ts-portal` or wherever you deploy).

**5a. Backup data on the droplet**

```bash
cd /path/to/ts-portal-gmu   # your app dir on the droplet
cp -r public public.bak
cp -r json json.bak
cp config.json config.json.bak
# If you use .env on the server:
cp .env .env.bak 2>/dev/null || true
```

**5b. Point at the new repo and reset to your pushed branch**

```bash
git fetch origin
git reset --hard origin/main
# If the default branch is master: git reset --hard origin/master
```

**5c. Restore data on the droplet**

```bash
rm -rf public json
mv public.bak public
mv json.bak json
mv config.json.bak config.json
mv .env.bak .env 2>/dev/null || true
```

**5d. Redeploy the app**

```bash
./scripts/deploy/deploy-prod.sh
# Or however you normally restart (e.g. docker compose up -d, pm2 restart, etc.)
```

---

## Optional: Add upstream again

To pull future changes from ts-portal:

```bash
git remote add upstream https://github.com/theirstory/ts-portal.git
# Then: git fetch upstream && git merge upstream/main
```

You can do this on both local and droplet if you use upstream there.
