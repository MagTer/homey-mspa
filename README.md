# M-Spa for Homey

Control and monitor your M-Spa hot tub directly from Homey.

## Features

- **Temperature Monitoring**: See real-time water temperature.
- **Full Control**: Set target temperature, toggle heater, filter, and bubbles.
- **Advanced Features**: Control Jets, Ozone sanitizer, and UVC (on supported models).
- **Flow Support**: Build automations with spa triggers (e.g., "Temperature changed", "Fault detected") and actions.
- **Status Visibility**: Get clear fault descriptions and connection status.

## Pairing Instructions

1. **Select Region**: Choose between ROW (Rest of World), US, or CH (China) based on where your account is registered.
2. **Login**: Enter your M-Spa mobile app email and password.
3. **Select Device**: Choose your hot tub from the list of available devices.

**Note**: If your hot tub was recently powered on, it may take a few minutes for the WiFi module to connect to the cloud. If pairing fails or the device shows as unavailable, please wait 2-3 minutes and try again.

## Supported Models

This app supports most modern M-Spa models using the M-Spa mobile app. The app automatically detects your model's capabilities (e.g., whether it has Jets or Ozone support) and only shows the relevant controls in Homey.

## Troubleshooting

- **Device Unavailable**: Check if the hot tub is powered on and connected to your WiFi.
- **Wrong Password**: If you get an authentication error, please double-check your credentials in the official M-Spa app.
- **API Limits**: The app uses conservative polling to respect M-Spa's cloud limits. Status updates may take up to 15 minutes during idle periods, but will update every 5 seconds for 30 seconds after you send a command.

## Disclaimer

This app is not affiliated with or endorsed by M-Spa. It uses the M-Spa cloud API, based on the implementation by [snarky-snark/ha-mspa](https://github.com/snarky-snark/ha-mspa).
