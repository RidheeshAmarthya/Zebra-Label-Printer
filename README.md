# Zebra Web Print - Universal Label Designer

A standalone web application for designing and printing Zebra labels (ZPL) directly from your browser. This tool is designed to work with Zebra thermal printers (ZD series, GK series, etc.) via the Zebra Browser Print service.

## Features

- **Live ZPL Preview**: Real-time rendering of your label as you type.
- **Universal Designer**: Easy-to-use form for common label fields (Header, Ref No, Description, Attributes, Notes, Barcode).
- **Manual ZPL Editor**: Advanced mode for direct ZPL manipulation and preview.
- **Printer Status Monitoring**: Live feedback on your printer's connection state (Online, Ready, Offline, Paper Out, Head Open).
- **Zero-Config Deployment**: Completely client-side; can be hosted on GitHub Pages, Vercel, or run locally.

## Usage

Open index.html and follow the setup guide. 

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
