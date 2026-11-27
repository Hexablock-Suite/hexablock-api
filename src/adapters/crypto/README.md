# adapters/crypto

The adapters that build on `node:crypto`. `ScryptPasswordHasher` implements the `PasswordHasher` port with scrypt, and `RandomUserIdGenerator` implements the `UserIdGenerator` port with a random UUID v4. Imports `src/application`, `src/domain` and `../received.ts`. A Node built-in is not a package: the folder imports no package (rule `other-adapters-import-no-package`) and only `node:crypto` among the built-ins (rule `crypto-adapters-import-only-node-crypto`); never `src/infrastructure`.
