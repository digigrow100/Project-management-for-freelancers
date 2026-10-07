# Freelance HQ WhatsApp Bridge

This Manifest V3 extension is installed only on the admin-controlled Chrome profile that stays logged into WhatsApp Web.

## Purpose
- Relay outbound messages queued from Freelance HQ to approved WhatsApp client chats.
- Sync inbound messages only from admin-whitelisted client mappings.
- Keep the WhatsApp session private from employees.
- Report bridge health to the admin app.

## Setup
1. In Freelance HQ open **Admin → WhatsApp Bridge**.
2. Download and unzip the extension.
3. Open Chrome → Extensions → Developer mode → Load unpacked.
4. Select the extracted `freelance-hq-whatsapp-bridge` folder.
5. Open WhatsApp Web and log in / scan the QR code.
6. Generate a short-lived pairing code in Freelance HQ and paste it into the extension popup.
7. Map approved clients and grant team access from the admin bridge page.

## Notes
WhatsApp Web is a changing web application. The bridge uses resilient accessibility/data-testid selectors, but a future WhatsApp UI change may require selector maintenance. Keep this bridge on a dedicated Chrome profile so its background client-sync navigation does not interrupt personal WhatsApp use.
