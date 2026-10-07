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


## Work-time behavior (v1.1.0)
- Opening Chrome by itself does not start work time.
- Before the first meaningful browser action, extension-online time is recorded as paused/idle.
- The work session starts on a real tab switch, URL navigation, or submitted ChatGPT/Claude prompt.
- After work has started, Chrome idle/locked time is recorded separately as paused time.
- Activity is checkpointed about once per minute so admin and employee timers stay current without per-second network requests.


## AI processing state (v1.2.0)
- ChatGPT and Claude generation is treated as active work while a visible Stop/Stop generating control is present.
- AI processing overrides the normal Chrome idle state, so long-running AI tasks keep counting as Working.
- When generation finishes, a 60-second grace period starts.
- If no new meaningful work starts during that grace period, the extension sends Offline and ends the current work session.
