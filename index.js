require("dotenv").config();

const chokidar = require("chokidar");
const path = require("path");
const puppeteer = require("puppeteer");
const { promises: fs } = require("fs");

const init = async () => {
  const cookieFileName = "cookies.json";
  const authOnly = process.argv[2] === "auth";
  const username = process.env.RH_USER;
  const password = process.env.RH_PASSWORD;
  const browser = await puppeteer.launch({
    headless: !authOnly,
    defaultViewport: null,
    args: ["--start-maximized"],
  });

  const page = await browser.newPage();

  await loadCookies(page, cookieFileName);

  console.log("Logging in...");

  await login(
    page,
    username,
    password,
    authOnly ? 60 * 5 * 1000 : 60 * 0.5 * 1000
  );

  console.log("Logged in...");

  await saveCookies(page, cookieFileName);

  if (!authOnly) {
    const watchFolder = path.join(__dirname, "new");

    chokidar
      .watch(watchFolder, {
        awaitWriteFinish: true,
        ignoreInitial: true,
      })
      .on("add", async (filePath) => {
        await processFile(page, password, filePath);
        await saveCookies(page, cookieFileName);
      });

    console.log(`Watching folder ${watchFolder}...`);
  } else {
    await logout(page);
    await browser.close();
  }
};

const processFile = async (page, password, filePath) => {
  const processedTime = new Date().getTime();
  const baseFileName = path.basename(filePath);

  console.log(`Processing file ${baseFileName}...`);

  try {
    const { symbol, quantity } = JSON.parse(await fs.readFile(filePath));

    console.log(
      `${
        quantity < 0 ? "Selling" : "Buying"
      } ${quantity} share(s) of ${symbol}...`
    );

    await marketTransaction(page, password, symbol, quantity);

    console.log(
      `${quantity < 0 ? "Sold" : "Bought"} ${quantity} share(s) of ${symbol}...`
    );

    await fs.copyFile(
      filePath,
      path.join(__dirname, "done", `done-${processedTime}-${baseFileName}`)
    );

    console.log(`Copied file ${baseFileName} to 'done' folder...`);
  } catch (e) {
    console.log(`Error processing file ${baseFileName}...`, e);

    try {
      await fs.copyFile(
        filePath,
        path.join(__dirname, "error", `error-${processedTime}-${baseFileName}`)
      );

      console.log(`Copied file ${baseFileName} to 'error' folder...`);

      await fs.writeFile(
        path.join(
          __dirname,
          "error",
          `error-message-${processedTime}-${baseFileName}`
        ),
        e,
        "utf8"
      );

      console.log(
        `Copied file ${baseFileName} to 'error' folder with message...`
      );
    } catch (e) {}
  }

  try {
    await fs.unlink(filePath);
    console.log(`Deleted ${baseFileName}...`);
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

const login = async (page, username, password, afterLoginPause) => {
  const userNameSelector = "input[name='username']";
  const passwordSelector = "input[name='password']";
  const buttonSelector = "button[type='submit']";
  const successSelector = "div[data-page-name='home']";
  const typeOptions = { delay: 25 };

  await page.goto("https://robinhood.com/login");

  await page.waitForSelector(userNameSelector);
  await page.focus(userNameSelector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(username, typeOptions);
  await pause(500);

  await page.waitForSelector(passwordSelector);
  await page.focus(passwordSelector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(password, typeOptions);
  await pause(500);

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

  const typeOptions = { delay: 25 };

  await page.goto(`https://robinhood.com/stocks/${symbol}`);

  await page.waitForSelector(quantitySelector);
  await page.focus(quantitySelector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(Math.abs(quantity).toString(), typeOptions);
  await pause(500);

  if ((await page.$(tabSelector)) !== null) {
    await page.click(tabSelector);
    await pause(500);
  }

  await page.waitForSelector(proceedSelector);
  await page.click(proceedSelector);
  await pause(500);

  await page.waitForSelector(submitSelector);
  await page.click(submitSelector);
  await pause(2000);

  if ((await page.$(passwordSelector)) !== null) {
    await page.waitForSelector(passwordSelector);
    await page.focus(passwordSelector);
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(password, typeOptions);
    await pause(500);

    await page.click(confirmSelector);
    await pause(2000);
  }
};

init();
