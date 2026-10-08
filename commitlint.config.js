/** Conventional commits, e.g. `feat(P3.4): guest checkout`. */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Task IDs like "P0.1" are used as scopes; allow upper case.
    'scope-case': [0],
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
