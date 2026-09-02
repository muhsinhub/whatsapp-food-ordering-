# QuickBite — WhatsApp Food Ordering Platform

## What this is
A SaaS WhatsApp food ordering bot for restaurants. Customers order 
via WhatsApp, restaurants manage orders via a web dashboard.

## Stack
- Node.js + Express (backend)
- Vercel (hosting)
- Meta WhatsApp Business API
- Supabase (database)
- GitHub: https://github.com/muhsinhub/whatsapp-food-ordering

## Key details
- Meta App ID: 1000861546329365
- Meta verify token: quickbite123
- Webhook URL: [your Vercel URL]/webhook
- Dashboard URL: [your Vercel URL]/dashboard

## How deployment works
- I push code to GitHub → Vercel auto-deploys
- Environment variables (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN, 
  META_VERIFY_TOKEN) are set in the Vercel dashboard, not in code

## Current status
- Bot, dashboard, Supabase database, customer name collection, 
  order status, and "ready for collection" button are all complete
- Webhook stopped responding after switching from Railway to Vercel 
  — this is the current blocker

## Business model
- Set up one system per restaurant client
- Charge a setup fee + monthly fee
- First client: a mosque hosting monthly takeaway evenings

## Conventions
- Owner is non-technical — always explain changes in plain English
- Never use Railway — we moved to Vercel
- Keep all API routes inside the /api folder