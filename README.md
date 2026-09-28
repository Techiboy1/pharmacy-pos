# Pharmacy POS

Offline-first pharmacy point-of-sale and inventory app built with React, Vite, and Electron. Local records are stored on the device, with LAN sync provided by the desktop app.

## Development

```powershell
npm ci
npm run dev
```

Build the web app with `npm run build`, or build the Windows desktop installer with `npm run electron:build`.

## Publish a Windows update

The GitHub Actions workflow in `.github/workflows/publish-windows.yml` publishes a release when a version tag is pushed. To publish the next update:

1. Update `version` in `package.json` (for example, `1.0.8`) and commit the code to `main`.
2. Push a matching tag (for example, `v1.0.8`). The workflow checks that the tag and package version match.
3. GitHub Actions builds the x64 and ia32 Windows installers and publishes the installer, `latest.yml`, and blockmap to the GitHub release.

Packaged clients check GitHub Releases when the app starts, download a newer compatible release, and restart to install it.

Do not commit `.env`, `node_modules`, `dist`, `release`, or `release-check`; the repository `.gitignore` excludes these local files and generated packages.
