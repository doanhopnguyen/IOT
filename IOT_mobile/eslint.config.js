const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // Keep compiler diagnostics visible for existing screens; React Compiler is not enabled.
  { rules: { 'react-hooks/set-state-in-effect': 'warn', 'react-hooks/immutability': 'warn' } },
  { ignores: ['dist/**', 'public/face-models/**'] },
]);
