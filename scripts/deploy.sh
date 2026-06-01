#!/bin/bash

# Aether Production Deployment Orchestrator
# Assumes Vercel CLI and Supabase CLI are configured.

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting Aether Production Deploy Process ===${NC}"

# 1. Run local validation tests
echo -e "\n${BLUE}[1/4] Running local typechecks and build tests...${NC}"
npm run build

# 2. Check Vercel CLI Authentication
echo -e "\n${BLUE}[2/4] Verifying Vercel authentication...${NC}"
if ! npx vercel whoami >/dev/null 2>&1; then
  echo -e "${RED}Error: You are not logged into Vercel CLI. Run 'npx vercel login' first.${NC}"
  exit 1
fi
echo -e "${GREEN}Vercel Authenticated.${NC}"

# 3. DB Migrations check
echo -e "\n${BLUE}[3/4] Database migrations status check...${NC}"
read -p "Have you applied migrations to your live Supabase DB? (y/n): " confirm_db
if [ "$confirm_db" != "y" ]; then
  echo -e "${RED}Please apply your Supabase migrations first. Aborting deploy.${NC}"
  exit 1
fi

# 4. Trigger Vercel Production Build
echo -e "\n${BLUE}[4/4] Deploying to Vercel...${NC}"
npx vercel --prod

echo -e "\n${GREEN}=== Aether Deployment Successful! ===${NC}"
