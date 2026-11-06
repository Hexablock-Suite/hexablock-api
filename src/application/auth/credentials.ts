// The input of the RegisterUser and Login input ports.
export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export type CredentialField = keyof Credentials;
