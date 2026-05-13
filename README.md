# Zebra Web Print - Universal Label Designer

A premium, standalone web application for designing and printing Zebra labels (ZPL) directly from your browser. This tool is designed to work with Zebra thermal printers (ZD series, GK series, etc.) via the Zebra Browser Print service.

## Features

- **Live ZPL Preview**: Real-time rendering of your label as you type.
- **Universal Designer**: Easy-to-use form for common label fields (Header, Ref No, Description, Attributes, Notes, Barcode).
- **Manual ZPL Editor**: Advanced mode for direct ZPL manipulation and preview.
- **Printer Status Monitoring**: Live feedback on your printer's connection state (Online, Ready, Offline, Paper Out, Head Open).
- **Zero-Config Deployment**: Completely client-side; can be hosted on GitHub Pages, Vercel, or run locally.

## End-to-End Setup Guide

To use this application with your Zebra printer, follow these steps:

### 1. Install Zebra Printer Drivers
Ensure your printer is connected via USB and recognized by your operating system.
- **Windows/Mac**: Download and install [Zebra Setup Utilities](https://www.zebra.com/us/en/support-downloads/software/utilities/zebra-setup-utilities.html).

### 2. Install Zebra Browser Print
This application requires the Zebra Browser Print service to communicate with the hardware.
- Download for Windows/Mac: [Zebra Browser Print](https://www.zebra.com/us/en/support-downloads/software/developer-tools/browser-print.html).
- Run the application after installation.

### 3. Configure the Default Printer
1. Open the Browser Print application.
2. Right-click the tray icon (Windows) or menu bar icon (Mac) and select **Settings**.
3. In the **Default Device** dropdown, select your Zebra printer.
4. Click **Change**.

### 4. Grant Browser Permission
1. Open this web application in a compatible browser (Chrome or Edge recommended).
2. When you click "Print" for the first time, a popup from Browser Print will appear asking for permission.
3. Click **Allow** (and check "Always allow" to prevent future prompts).

## Local Development

Since this project is completely standalone, you can run it by simply opening `index.html` in your browser.

```bash
# Clone the repository
git clone https://github.com/your-username/Zebra-Label-Printer.git

# Open index.html
open index.html
```

## Technologies Used

- **HTML5/Vanilla JS/CSS3**: Core logic and styling.
- **Lucide Icons**: Modern iconography.
- **Zebra Browser Print SDK**: Hardware communication.
- **ZPL-JS**: Local ZPL rendering for previews.

## License

MIT License - Feel free to use this for personal or commercial projects.
