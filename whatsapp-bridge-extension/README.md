# Freelance HQ WhatsApp Bridge

This Manifest V3 extension is installed only on the admin-controlled Chrome profile that stays logged into WhatsApp Web.

## Purpose
- Search WhatsApp by a name and return all matching chats without adding them automatically.
- Let the admin map only the exact chats they choose.
- Let the admin browse their own WhatsApp chats without first mapping them to a client.
- Fetch a selected day of chat history on demand.
- Share only selected old messages, a full selected day, or another approved range with a team member.
- Keep all old history hidden from team members by default.
- Relay new team messages through the admin WhatsApp Web session.
- Report bridge health to Freelance HQ.

## Setup
1. In Freelance HQ open **Admin → WhatsApp Bridge**.
2. Download and unzip the extension.
3. Open Chrome → Extensions → Developer mode → Load unpacked.
4. Select the extracted WhatsApp bridge extension folder.
5. Open WhatsApp Web and log in / scan the QR code.
6. Generate a short-lived pairing code in Freelance HQ and paste it into the extension popup.
7. Use **Client Mapping** to scan a WhatsApp name and manually add only the chat you want.
8. Use **My WhatsApp Chats** to browse your own chats, load a date, send a direct message, or share selected context with a team member.

## Privacy behavior
A team member never receives old WhatsApp history just because a client is mapped or access is enabled. Old messages must be explicitly shared by the admin. New messages are visible only from the time that team access is granted.

## Notes
WhatsApp Web is a changing web application. The bridge uses accessibility/data-testid selectors and may need selector maintenance after a future WhatsApp UI update. Date-history loading works by opening the selected chat and scrolling older messages into the page, so WhatsApp Web must stay open and logged in while the request runs.
