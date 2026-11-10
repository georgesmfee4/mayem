// Tests dans un vrai Chromium avec l'extension chargée. Usage : npm run test:navigateur
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/preparer.js',
  // Un seul Chromium à la fois : chaque test charge l'extension dans son propre profil
  workers: 1,
  timeout: 30_000,
  webServer: { command: 'node e2e/serveur.js', url: 'http://127.0.0.1:8765/fixtures/simple.html', reuseExistingServer: true },
});
