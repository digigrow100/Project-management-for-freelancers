// Auth is server-only in this app. Keep PKCE and session cookies inaccessible to JS.
export function secureAuthCookie<T extends object>(options:T) {
 return {...options,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
}
