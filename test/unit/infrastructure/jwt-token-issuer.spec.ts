import { JwtService } from '@nestjs/jwt';
import { UserId } from '../../../src/domain/user/user-id.js';
import { createJwtService } from '../../../src/infrastructure/auth/auth-config.js';
import { JwtTokenIssuer } from '../../../src/infrastructure/auth/jwt-token-issuer.js';
import { TEST_JWT_SECRET } from '../../support/auth/test-jwt-secret.js';

const USER_ID = UserId.from('6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01');

// A token with alg "none" and an empty signature, as an attacker can write it.
function unsignedToken(payload: object): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

describe('JwtTokenIssuer', () => {
  const issuer = new JwtTokenIssuer(createJwtService(TEST_JWT_SECRET));

  it('should_issue_hs256_token_with_user_id_subject_when_token_is_issued', () => {
    const token = issuer.issue(USER_ID);

    const decoded = new JwtService().decode<{ sub: string; iat: number; exp: number }>(token, {
      complete: true,
    });
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload.sub).toBe(USER_ID.value);
    expect(decoded.payload.exp - decoded.payload.iat).toBe(24 * 60 * 60);
    expect(new JwtService({ secret: TEST_JWT_SECRET }).verify(token)).toMatchObject({
      sub: USER_ID.value,
    });
  });

  it('should_return_user_id_when_token_is_valid', () => {
    expect(issuer.verify(issuer.issue(USER_ID))).toEqual(USER_ID);
  });

  it('should_return_null_when_token_is_signed_with_another_secret', () => {
    const other = new JwtTokenIssuer(createJwtService('another-secret-with-at-least-32-chars'));

    expect(issuer.verify(other.issue(USER_ID))).toBeNull();
  });

  it('should_return_null_when_token_has_expired', () => {
    const expired = new JwtService({ secret: TEST_JWT_SECRET }).sign(
      { sub: USER_ID.value },
      { expiresIn: -10 },
    );

    expect(issuer.verify(expired)).toBeNull();
  });

  it('should_return_null_when_token_is_malformed_or_has_no_subject', () => {
    const noSubject = new JwtService({ secret: TEST_JWT_SECRET }).sign({ role: 'player' });

    for (const token of ['', 'not-a-jwt', noSubject]) {
      expect(issuer.verify(token)).toBeNull();
    }
  });

  // A sub that is not a UUID is one more bad token (#64).
  it('should_return_null_when_token_subject_is_not_a_uuid', () => {
    const notUuid = new JwtService({ secret: TEST_JWT_SECRET }).sign({ sub: 'not-a-uuid' });

    expect(issuer.verify(notUuid)).toBeNull();
  });

  it('should_return_null_when_token_has_alg_none_and_no_signature', () => {
    expect(issuer.verify(unsignedToken({ sub: USER_ID.value }))).toBeNull();
  });

  it('should_return_null_when_token_is_signed_with_hs512_and_the_right_secret', () => {
    const hs512 = new JwtService({ secret: TEST_JWT_SECRET }).sign(
      { sub: USER_ID.value },
      { algorithm: 'HS512' },
    );

    expect(issuer.verify(hs512)).toBeNull();
  });
});
