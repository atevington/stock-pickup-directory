require("dotenv").config();

const chokidar = require("chokidar");
const path = require("path");
const puppeteer = require("puppeteer");
const { promises: fs } = require("fs");

const logMessage = (message, ...rest) =>
  console.log(new Date(), message, ...rest);

const init = async () => {
  const queue = [];
  const cookieFileName = "cookies.json";
  const authOnly = process.argv[2] === "auth";
  const username = process.env.RH_USER;
  const password = process.env.RH_PASSWORD;
  const browser = await puppeteer.launch({
    headless: !authOnly,
    defaultViewport: !authOnly
      ? {
          width: 1920,
          height: 1080,
        }
      : null,
    args: !authOnly ? [] : ["--start-maximized"],
  });

  const page = await browser.newPage();

  await loadCookies(page, cookieFileName);

  logMessage("Logging in...");

  await login(page, username, password, 60 * 1000 * (authOnly ? 5 : 0.5));

  logMessage("Logged in...");

  await saveCookies(page, cookieFileName);

  logMessage("Saved cookies...");

  if (!authOnly) {
    const watchFolder = path.join(__dirname, "new");

    chokidar
      .watch(watchFolder, {
        awaitWriteFinish: true,
        ignoreInitial: true,
      })
      .on("add", (filePath) => queue.push(filePath));

    logMessage(`Watching folder ${watchFolder}...`);

    let processing = false;

    setInterval(async () => {
      if (processing || queue.length === 0) {
        return;
      }

      processing = true;
      await processFile(page, password, queue.shift());
      await saveCookies(page, cookieFileName);
      processing = false;
    }, 2000);
  } else {
    await logout(page);
    await saveCookies(page, cookieFileName);
    await browser.close();
  }
};

const processFile = async (page, password, filePath) => {
  const processedTime = new Date().getTime();
  const baseFileName = path.basename(filePath);

  logMessage(`Processing file ${baseFileName}...`);

  try {
    const { symbol, quantity } = JSON.parse(await fs.readFile(filePath));

    logMessage(
      `${quantity < 0 ? "Selling" : "Buying"} ${Math.abs(
        quantity
      )} share(s) of ${symbol}...`
    );

    await marketTransaction(page, password, symbol, quantity);

    logMessage(
      `${quantity < 0 ? "Sold" : "Bought"} ${Math.abs(
        quantity
      )} share(s) of ${symbol}...`
    );

    await fs.copyFile(
      filePath,
      path.join(__dirname, "done", `done-${processedTime}-${baseFileName}`)
    );

    logMessage(`Copied file ${baseFileName} to 'done' folder...`);
  } catch (e) {
    logMessage(`Error processing file ${baseFileName}...`, e);

    try {
      await fs.copyFile(
        filePath,
        path.join(__dirname, "error", `error-${processedTime}-${baseFileName}`)
      );

      logMessage(`Copied file ${baseFileName} to 'error' folder...`);

      await fs.writeFile(
        path.join(
          __dirname,
          "error",
          `error-message-${processedTime}-${baseFileName}`
        ),
        e,
        "utf8"
      );

      logMessage(
        `Copied file ${baseFileName} to 'error' folder with message...`
      );
    } catch (e) {}
  }

  try {
    await fs.unlink(filePath);
    logMessage(`Deleted ${baseFileName}...`);
  } catch (e) {}
};

const pause = (length) => new Promise((resolve) => setTimeout(resolve, length));

const loadCookies = async (page, fileName) => {
  try {
    const cookies = JSON.parse(await fs.readFile(fileName));
    await page.setCookie(...cookies);
  } catch (e) {}
};

const saveCookies = async (page, fileName) => {
  try {
    const cookies = await page.cookies();
    await fs.writeFile(fileName, JSON.stringify(cookies));
  } catch (e) {}
};

const clearFieldAndType = async (page, selector, text, pauseLength) => {
  await page.waitForSelector(selector);
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 25 });
  await pause(pauseLength);
};

const login = async (page, username, password, afterLoginPause) => {
  const userNameSelector = "input[name='username']";
  const passwordSelector = "input[name='password']";
  const buttonSelector = "button[type='submit']";
  const successSelector = "div[data-page-name='home']";

  await page.goto("https://robinhood.com/login");
  await clearFieldAndType(page, userNameSelector, username, 500);
  await clearFieldAndType(page, passwordSelector, password, 500);
  await page.click(buttonSelector);
  await page.waitForSelector(successSelector, { timeout: afterLoginPause });
};

const logout = async (page) => {
  const accountLinkSelector = "a[href='/account']";
  const logOutSelector = "a[href='/login']";

  await page.click(accountLinkSelector);
  await page.waitForSelector(logOutSelector);
  await page.click(logOutSelector);
};

const marketTransaction = async (page, password, symbol, quantity) => {
  const passwordSelector = "div[role='dialog'] input[name='password']";
  const confirmSelector = "div[role='dialog'] button[type='submit']";

  const tabSelector =
    quantity < 0
      ? "form[data-testid='OrderForm'] div[role='button'][data-testid='OrderFormHeading-Sell']"
      : "form[data-testid='OrderForm'] div[role='button']:not([data-testid='OrderFormHeading-Sell'])";

  const quantitySelector =
    "form[data-testid='OrderForm'] input[data-testid='OrderFormRows-Shares']";

  const proceedSelector =
    "form[data-testid='OrderForm'] [data-testid='OrderFormControls-Review']";

  const submitSelector =
    "form[data-testid='OrderForm'] [data-testid='OrderFormControls-Submit']";

  await page.goto(`https://robinhood.com/stocks/${symbol}`);

  await clearFieldAndType(
    page,
    quantitySelector,
    Math.abs(quantity).toString(),
    500
  );

  if ((await page.$(tabSelector)) !== null) {
    await page.waitForSelector(tabSelector);
    await page.click(tabSelector);
    await pause(500);
  } else if (quantity < 0) {
    throw new Error(`Cannot sell '${symbol}'!`);
  }

  await page.waitForSelector(proceedSelector);
  await page.click(proceedSelector);
  await pause(500);

  await page.waitForSelector(submitSelector);
  await page.click(submitSelector);
  await pause(2000);

  if ((await page.$(passwordSelector)) !== null) {
    await clearFieldAndType(page, passwordSelector, password, 500);
    await page.click(confirmSelector);
    await pause(2000);
  }
};

init();
