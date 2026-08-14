# M-Spa for Homey

Control and monitor your M-Spa hot tub directly from Homey.

## Features

- **Temperature Monitoring**: See real-time water temperature.
- **Full Control**: Set target temperature, toggle heater, filter, and bubbles.
- **Advanced Features**: Control Jets, Ozone sanitizer, and UVC (on supported models).
- **Flow Support**: Build automations with spa triggers (e.g., "Temperature changed", "Fault detected") and actions.
- **Status Visibility**: Get clear fault descriptions and connection status.

## Setup Instructions

### 1. Configure your Account
Before adding your spa, you must configure your M-Spa account in the app settings:
1.  Go to **More > Settings > Apps > M-Spa Hot Tub** in the Homey app.
2.  Click **Configure App**.
3.  Enter your **Email**, **Password**, and select your **Region**.
4.  Click **Verify and Save**. The app will test your credentials against the M-Spa API.

### 2. Add your Device
Once your account is configured:
1.  Go to **Devices > Add Device (+)**.
2.  Search for **M-Spa** and click **Connect**.
3.  Choose your hot tub from the list of detected devices.

**Note**: If your hot tub was recently powered on, it may take a few minutes for the WiFi module to connect to the cloud. If the device list is empty, please wait 2-3 minutes and try again.

## Supported Models

The app automatically detects your model's capabilities (e.g., Delight, Premium, Elite, Muse, Frame, Urban) and only shows the relevant controls in Homey. 

- **Basic Models**: Heater, Filter, Bubbles.
- **Advanced Models**: Adds Jets, Ozone, and UVC where supported.

## Troubleshooting

- **"Please configure your account"**: This means you haven't completed Step 1 (Setup Instructions) yet.
- **Device Unavailable**: Check if the hot tub is powered on and connected to your WiFi.
- **API Polling**: To respect M-Spa's cloud limits, status updates occur every 15 minutes during idle periods, but increase to every 5 seconds for 30 seconds after you send a command.

## Developer Information

This app is built using **Homey SDK v3** and **TypeScript**.

### Building
The project uses the Homey Compose pattern. To build and run:
```bash
npx homey app run
```

To build and install on your own Homey Pro: `npm run install:homey`.

### Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). In short: everything in the repository
is written in English, user-facing text lives in the locale files, and existing
Flow cards must not change meaning.

### API Client
The API communication is centralized in `app.ts` to ensure global rate limiting (400ms throttle) and single authentication state.

### Releases
Pushes and pull requests run typecheck, unit tests and `homey app validate`.
Releases are cut from the **Version** workflow in GitHub Actions, which bumps
the version, writes the changelog and pushes a `v*` tag; the tag triggers
**Publish**, which publishes to the Homey App Store. Do not edit the version or
`.homeychangelog.json` by hand.

## Disclaimer

This app is not affiliated with or endorsed by M-Spa. It uses the M-Spa cloud API, based on the implementation by [snarky-snark/ha-mspa](https://github.com/snarky-snark/ha-mspa).
