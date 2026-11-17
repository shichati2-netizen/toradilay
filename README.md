# ToraDelia

## Windows packaging

The Windows workflow builds an unpacked Electron application and publishes the complete
`win-unpacked` folder as a versioned ZIP. The launcher EXE stays small; application code,
the standalone Next.js server, and runtime resources remain separate files under
`resources/app`. Keep the extracted folder structure intact when running the app.

Each CI run receives a unique version and release asset, so older ZIP releases are not
overwritten.

## Built-in links portal

The header contains a portal for the seven supplied service links. Each site opens in a
separate window managed by ToraDelia rather than launching the system browser. Only the
explicit HTTPS hosts used by the portal are allowed in those child windows.

## Idle performance

The expensive SVG liquid-glass refraction is suspended while the kiosk is idle and is
re-enabled when the user interacts with the app. Existing kiosk behavior and settings
remain unchanged.
