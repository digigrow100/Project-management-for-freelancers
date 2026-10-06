# Freelance HQ Chrome Extension

Manifest V3 extension integrated with the existing Project Management App.

## Load unpacked
1. Open chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select this chrome-extension folder
5. Log in to the Project Management App as the employee
6. Click Connect Chrome Extension
7. Copy the one-time code and paste it into the extension popup

The pairing code contains the current app origin, so the extension requests permission only for that exact app origin at pairing time.

## Permissions
- tabs: read active tab URL/title for activity tracking
- storage: keep device token, queues and session state locally
- idle: distinguish active browser use from idle/locked
- alarms: lightweight heartbeat/batch upload
- content script access only on chatgpt.com and claude.ai for submitted-prompt detection
- optional host permission: requested only for the paired Project Management App origin

The extension does not capture keystrokes, passwords, form fields, screenshots, AI responses, uploaded file contents, or background-tab time.
