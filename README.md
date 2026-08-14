# M-Spa for Homey

Control and monitor your M-Spa hot tub directly from Homey.

## Features

- **Temperature Monitoring**: See real-time water temperature.
- **Full Control**: Set target temperature (20–42 °C), toggle heater, filter, and bubbles.
- **Advanced Features**: Control Jets, Ozone sanitizer, and UVC (on supported models).
- **Dashboard Widget**: An interactive "M-Spa Panel" widget styled after the physical control panel.
- **Flow Support**: Triggers ("Temperature changed", "Fault detected", device online/offline), actions for every control, and conditions for heater, filter, bubbles, jets, ozone, UVC, temperature and reachability.
- **Status Visibility**: Get clear fault descriptions and connection status.
- **Languages**: English, German, Norwegian and Swedish.

## Setup Instructions

### 1. Configure your Account
Before adding your spa, you must configure your M-Spa account in the app settings:
1.  Go to **More > Settings > Apps > M-Spa** in the Homey app.
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

Every model gets water temperature, target temperature, heater and filter. The
app then matches your series against a profile and adds the optional controls
that series has:

| Series | Bubbles | Jets | Ozone | UVC |
| --- | :-: | :-: | :-: | :-: |
| Comfort | ✅ | | | |
| Delight | ✅ | | | |
| Premium | ✅ | | ✅ | |
| Urban | ✅ | | ✅ | ✅ |
| Frame | ✅ | | ✅ | ✅ |
| Verto | ✅ | | ✅ | ✅ |
| Elite | ✅ | ✅ | ✅ | |
| Muse | ✅ | ✅ | ✅ | |

If your model is not recognized, the app keeps bubbles, ozone and UVC available
rather than hiding them. That is deliberate: a control the spa does not have is
simply rejected by the M-Spa cloud, while a control that was hidden by mistake
used to be impossible to get back. If you see a control your spa does not have,
that is why — please open an issue with your model code so the profile can be
added.

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
`app.ts` owns the single `MspaApiClient` and rebuilds it whenever the credentials
change, so all devices share one authentication state and one 400 ms request
throttle. The only exception is `api.js`, which builds a throw-away client to
verify credentials from the settings page before they are saved.

### Releases
Pushes and pull requests run typecheck, unit tests and `homey app validate`.
Releases are cut from the **Version** workflow in GitHub Actions, which bumps
the version, writes the changelog and pushes a `v*` tag; the tag triggers
**Publish**, which publishes to the Homey App Store. Do not edit the version or
`.homeychangelog.json` by hand.

## Disclaimer

This app is not affiliated with or endorsed by M-Spa. It uses the M-Spa cloud API, based on the implementation by [snarky-snark/ha-mspa](https://github.com/snarky-snark/ha-mspa).
