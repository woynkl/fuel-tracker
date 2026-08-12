# Personal Fuel Tracker

A mobile-first, local-first fuel tracker for one personal vehicle.

Business data is stored directly in IndexedDB in the current browser. Recording fuel, deleting records, calculating statistics, and JSON backup/restore do not require a server, account, login, SQLite database, or cloud service.

## Features

- Record mileage, amount paid, unit price, date, and full/partial fill
- Calculate liters from `amount / unit price`
- Calculate real consumption and cost with full-to-full intervals
- Recalculate all derived statistics after deletion
- Export and import schemaVersion 1 JSON backups locally
- Import schemaVersion 1 backups from the previous server version

Data exists only on the current device. Export backups regularly, and always export before clearing browser data or uninstalling a future APK.

## Development

Node.js 22.6 or newer is required.

```bash
npm install
npm test
npm run lint
npm run dev
```

No database or authentication environment variables are required. This phase still uses the normal Next.js development/build workflow; static export, Capacitor, and Android packaging are later phases.

## Stack

- Next.js + React + TypeScript
- IndexedDB LocalRepository
- Pure TypeScript fuel and backup logic
- Mobile Material-style UI

## License

This fork retains the original MIT license and author attribution from `jyh9521/fuel-tracker`.
