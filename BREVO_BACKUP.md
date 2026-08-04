# Brevo Email Configuration — Backup
# Created: 2026-08-04

## API Credentials
BREVO_API_KEY=<GET FROM RENDER ENV VARS>
EMAIL_FROM=polkadot.nails@yandex.by
BREVO_SENDER_NAME=PolkaDot

## Brevo Account
Email: polkadot.nails@yandex.by
Password: polkadot101010
Dashboard: https://app.brevo.com
Plan: Free (300 emails/day)

## Verified Senders
- polkadot.nails@yandex.by (Verified)

## Domain (added but not fully verified — missing DKIM with _domainkey)
- polkadot.by (brevo-code: f0789983928f527ce1c53a9c3571c7d1)

## DNS Records Added on activecloud.by
- brevo1.polkadot.by → CNAME → b1.polkadot-by.dkim.brevo.com
- brevo2.polkadot.by → CNAME → b2.polkadot-by.dkim.brevo.com
- polkadot.by → TXT → brevo-code:f0789983928f527ce1c53a9c3571c7d1
- _dmarc.polkadot.by → TXT → v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com

## Status
- Gmail: Works (inbox)
- Yandex: Works (spam)
- mail.ru: NOT delivered
- vk.com: NOT delivered

## To Restore
1. Set BREVO_API_KEY in Render env vars
2. Set EMAIL_FROM=polkadot.nails@yandex.by in Render env vars
3. Code: use sendEmail() function with Brevo API in server.js
