# stock-pickup-directory
Automatically place buy and sell orders on Robinhood. Use at your own risk.

## Setup
Create a file named `.env` in the root directory with the following structure:

```
RH_USER=email@domain.com
RH_PASSWORD=password
```

To get started:

```
npm install
npm run authorize
```

This will launch a browser session and enter your credentials from `.env`. Robinhood will then likely ask to text or email you to authorize this device before logging in. After this is done, the device will be authorized and cookies will be saved to `cookies.json` for future use.

You can then run `npm start` in the background, which watches the `new` folder for newly created files (incoming order requests). How you choose to feed the files into this folder is entirely up to you.

To buy a stock at market, the file should have this structure:

```
{
    "symbol": "SPY",
    "quantity": 1
}
```

To sell a stock at market, the file should have this structure:

```
{
    "symbol": "SPY",
    "quantity": -1
}
```