// The opaque token that a signed-in client sends with each guarded request.
// It is the response of the Login input port and the request of the
// AuthenticateToken input port, so it lives next to those use cases. The
// TokenIssuer port imports it from here (#213).
export type SessionToken = string;
