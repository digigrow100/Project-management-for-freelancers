# Freelance HQ Chrome Extension

Manifest V3 extension integrated with the existing Project Management App.

## Load unpacked
1. Open chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select this chrome-extension folder
5. Log in to the Project Management App as the employee
6. Click **Connect Chrome Extension**
7. Copy the one-time code and paste it into that Chrome profile's extension popup
8. For another Chrome profile, click **Add another Chrome profile** and use the new code there

Each Chrome profile must use its own one-time code. Generating a second or third code does not invalidate other still-unused codes. All profiles paired while signed in as the same user report activity to that same user account.

The pairing code contains the exact app origin that generated it, so the extension requests permission only for that origin at pairing time. If the server unexpectedly returns an HTML page instead of JSON, v1.2.1 shows a readable pairing error instead of the raw `Unexpected token '<'` JSON parse error.

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


## Multi-profile pairing (v1.2.1)
- One signed-in Freelance HQ user can pair multiple Chrome profiles.
- Every Chrome profile gets a different one-time pairing code and its own device/install identity.
- Codes stay valid independently until used or until their ~10 minute expiry.
- Activity from those profiles is stored under the same employee/admin account.
- Reporting remains work/website/project focused; Chrome profile identity is only a device-level technical detail.
