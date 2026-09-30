/**
 * Runtime configuration, injected at build time via Vite env vars (VITE_*).
 * Values come from the deployed CloudFormation stack outputs.
 */
export const config = {
  apiEndpoint: import.meta.env.VITE_API_ENDPOINT as string,
  userPoolId: import.meta.env.VITE_USER_POOL_ID as string,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
  region: (import.meta.env.VITE_REGION as string) ?? "af-south-1",
};
