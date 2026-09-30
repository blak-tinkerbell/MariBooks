/**
 * Cognito authentication (SRP) for the SPA. No client secret in the browser.
 * Exposes sign-up, confirm, sign-in, sign-out and a getter for the current ID token
 * (used as the bearer token for the API).
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  type ISignUpResult,
} from "amazon-cognito-identity-js";
import { config } from "./config.js";

// Created on first use so the demo (which never touches Cognito) works even without config.
let _pool: CognitoUserPool | null = null;
function userPool(): CognitoUserPool {
  _pool ??= new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
  return _pool;
}

export function signUp(email: string, password: string): Promise<ISignUpResult> {
  return new Promise((resolve, reject) => {
    userPool().signUp(email, password, [], [], (err, result) => {
      if (err || !result) return reject(err ?? new Error("Sign-up failed"));
      resolve(result);
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool() });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool() });
  const details = new AuthenticationDetails({
    Username: email,
    Password: password,
  });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function signOut(): void {
  userPool().getCurrentUser()?.signOut();
}

export function currentEmail(): string | null {
  return userPool().getCurrentUser()?.getUsername() ?? null;
}

/** Resolve a valid ID token, refreshing the session if needed. Null if not signed in. */
export function getIdToken(): Promise<string | null> {
  const user = userPool().getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}
