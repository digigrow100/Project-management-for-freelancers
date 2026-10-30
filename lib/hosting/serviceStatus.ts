// Only known, actionable errors may cross the server boundary.
export function serviceStatusError(message: string): string | null {
  if (message.includes("App Hosting server enforcement is not verified")) return "This App Hosting service is not ready to activate. Complete its server setup, then use Check status to verify it before selecting Active.";
  if (message.includes("App Hosting must start pending server enrollment")) return "New App Hosting services must start Pending until their server setup is verified.";
  if (message.includes("Service status changed since this page loaded")) return "This service changed in another session. Refresh the page and choose its status again.";
  if (message.includes("Unknown hosting service")) return "This hosting service no longer exists. Refresh the page.";
  return null;
}
