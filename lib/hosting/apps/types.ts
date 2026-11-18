import type { Framework, RedirectMode } from "./validate";

export type HostingApp = {
  id: string;
  name: string;
  display_name: string;
  client_id: string | null;
  framework: Framework;
  source_kind: "git" | "image";
  source_url: string;
  git_ref: string | null;
  dockerfile_path: string | null;
  port: number;
  cpu: number;
  memory_mb: number;
  www_redirect: RedirectMode;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type HostingDeployment = {
  id: string;
  app_id: string;
  status: string;
  trigger: string;
  image_ref: string | null;
  log_excerpt: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type HostingAppDomain = {
  id: string;
  app_id: string;
  hostname: string;
  verification_token: string;
  is_primary: boolean;
  status: string;
  detail: string | null;
  last_checked_at: string | null;
  created_at: string;
};

export type HostingEnvName = { id: string; app_id: string; name: string; updated_at: string };

export const APP_COLUMNS = "id,name,display_name,client_id,framework,source_kind,source_url,git_ref,dockerfile_path,port,cpu,memory_mb,www_redirect,status,last_error,created_at,updated_at";
