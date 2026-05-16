# ChatNoir Web

ChatNoir Web is a static Next.js application for playing and testing AI-driven mystery scenarios in the browser.

## Overview

- Built with Next.js static export for GitHub Pages deployment.
- Uses the Gemini client SDK directly in the browser.
- The user provides their own API key; no server-side key storage is required.
- Includes a sample scenario and support assistant flow for local or static hosting use.

## Requirements

- Node.js 20 or later
- npm
- A Gemini API key for actual play

## Local Development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Build

Create a static export:

```bash
npm run build
```

The generated static site is written to the out directory.

## Notes

- This app is designed for static hosting.
- API keys are handled client-side in the browser.
- Files under public are shipped as public assets when deployed.
