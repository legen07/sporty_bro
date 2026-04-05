import { chromium } from "playwright";
import { writeFile, readFile, mkdir } from "fs/promises";

// Utility function to retry actions
async function retryAction(action, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await action();
      return true;
    } catch (err) {
      console.log(`Attempt ${i + 1} failed: ${err.message}`);
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Safe click with verification
async function safeClick(locator, options = {}) {
  const { timeout = 10000, retries = 3 } = options;

  return retryAction(async () => {
    await locator.waitFor({ state: "visible", timeout });
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: "attached", timeout: 5000 });

    // Wait a bit for any animations
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify element is still visible and enabled
    const isVisible = await locator.isVisible();
    const isEnabled = await locator.isEnabled().catch(() => true);

    if (!isVisible || !isEnabled) {
      throw new Error("Element not ready for interaction");
    }

    await locator.click({ timeout });
    console.log("✓ Click successful");
  }, retries);
}

// Safe fill with verification
async function safeFill(locator, text, options = {}) {
  const { timeout = 10000, retries = 3 } = options;

  return retryAction(async () => {
    await locator.waitFor({ state: "visible", timeout });
    await locator.scrollIntoViewIfNeeded();

    // Clear existing text
    await locator.clear();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Fill the text
    await locator.fill(text, { timeout });

    // Verify the text was filled
    const value = await locator.inputValue();
    if (value !== text) {
      throw new Error(
        `Fill verification failed. Expected: ${text}, Got: ${value}`
      );
    }

    console.log(`✓ Fill successful: ${text}`);
  }, retries);
}

// Safe wait for selector with retry
async function safeWaitForSelector(page, selector, options = {}) {
  const { timeout = 30000, retries = 3 } = options;

  return retryAction(async () => {
    await page.waitForSelector(selector, { state: "visible", timeout });
    console.log(`✓ Selector found: ${selector}`);
  }, retries);
}

const context = await chromium.launchPersistentContext("./chromium", {
  viewport: { width: 1050, height: 1000 },
  headless: false,
  args: ["--window-position=1200,0"],
});

const page = context.pages()[0] || (await context.newPage());
await page.bringToFront();

// Ensure history directory exists
try {
  await mkdir("./history", { recursive: true });
} catch (err) {
  console.log("History directory already exists or created");
}

let oldIds = [];
let idFiles = {};

try {
  oldIds = JSON.parse(await readFile("./ids.json", "utf8"));
} catch (err) {
  console.log("No existing ids.json file found");
}

page.setDefaultTimeout(30000); // Increased default timeout

await page.goto("https://sportybet.com/gh/sport/football/upcoming?time=0", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(5000);

let j = 0;
const ids = [];

async function start() {
  try {
    // Wait for main content with retry
    await safeWaitForSelector(page, "#importMatch .match-league-wrap", {
      timeout: 30000,
      retries: 5,
    });

    await page.waitForTimeout(500);

    // Check login status
    const isLoggedIn = await page
      .locator("#j_page_header.s-header.s-header-on")
      .count();

    if (!isLoggedIn) {
      console.log("Starting login process...");

      const registerBtn = page.locator(
        ".m-login-bar .m-opt button[name='register']"
      );
      await safeClick(registerBtn);

      const loginTab = page
        .locator("div")
        .filter({ hasText: /^Login$/ })
        .first();
      await safeClick(loginTab);

      const mobileInput = page
        .locator("#esDialog0")
        .getByRole("textbox", { name: "Mobile Number" });
      await safeFill(mobileInput, "593861032");

      const passwordInput = page
        .locator("#esDialog0")
        .getByRole("textbox", { name: "Password" });
      await safeFill(passwordInput, '+n"!p,r6WwA3Vik');

      const loginBtn = page
        .locator("#esDialog0")
        .getByRole("button", { name: "Login" });
      await safeClick(loginBtn);

      // Wait for login to complete
      await page.waitForTimeout(300);
      console.log("✓ Login completed");
    }

    const leagues = await page.locator("#importMatch .match-league-wrap").all();
    console.log(`Found ${leagues.length} leagues`);

    async function bet() {
      console.log("Placing bet...");
      const slip = page.locator(".m-betslips .m-stake");

      const stakeInput = slip.locator(
        ".m-plays-wrapper .m-plays .m-money input"
      );
      await safeFill(stakeInput, "0.5");

      const betBtn = slip.locator(
        ".m-btn-wrapper button.af-button.af-button--primary"
      );
      await safeClick(betBtn, { retries: 5 });
      
      
      await page.waitForTimeout(150);
      await safeClick(betBtn, { retries: 5 });

      const confirm = slip.locator(
        ".m-comfirm-wrapper .m-btn-wrapper button.af-button.af-button--primary"
      );
      await safeClick(confirm, { retries: 5 });

      await page.waitForTimeout(100);

      const success = page.locator(
        ".m-dialog-wrapper .m-btn-wrapper.m-ok-wrap button.af-button.af-button--primary"
      );
      await safeClick(success, { retries: 5 });

      console.log("✓ Bet placed successfully");
    }

    async function stake(league) {
      const marketItem = league.locator(
        ".market-group .market-item:nth-child(5)"
      );
      await safeClick(marketItem);

      await page.waitForTimeout(500);
      await league.locator(".market-group .market-item:nth-child(5) ul.select-list li:nth-child(1)").click();

      const matches = await league
        .locator(".m-table.match-table > .m-table-row")
        .all();
      console.log(`Processing ${matches.length} matches`);

      async function selectedOdd(odds) {
        let notThree = [];
        for (const odd of odds) {
          const oddNum = +(await odd.textContent());
          if (oddNum < 3) {
            notThree.push(odd);
          }
        }

        if (notThree.length === 1) return odds[0];

        let maxEle;
        for (const odd of notThree) {
          const oddNum = +(await odd.textContent());
          const maxNum = Math.max(
            ...(await Promise.all(
              notThree.map(async (each) => +(await each.textContent()))
            ))
          );

          if (oddNum === maxNum) {
            maxEle = odd;
            break;
          }
        }
        return maxEle;
      }

      let dateText;
      for (const match of matches) {
        try {
          if (await match.evaluate((el) => el.classList.contains("date-row"))) {
            dateText = await match.locator(".date").textContent();
            const [month, day] = [
              +/(?<=\/)\d+/.exec(dateText)[0],
              +/\d+/.exec(dateText)[0],
            ];

            const hour = (Math.abs(month - 12) + 1) * day;
            const toDate = new Date();
            const nextWeek =
              (Math.abs(toDate.getMonth() + 1 - 12) + 1) *
              (toDate.getDate() + 7);
            
              console.log(month, "\nDay : ", day)
              console.log(nextWeek);
              console.log(hour);
              await page.pause();


            if (nextWeek < hour) {
              break;
            } else {
              continue;
            }
          }

          const idsFile = /[^]+ /.exec(dateText)[0].trim().replace("/", "-");
          const idText = await match.locator(".time div.game-id").textContent();
          const id = /\d+/.exec(idText)[0];

          let history = [];
          try {
            history = JSON.parse(
              await readFile(`./history/${idsFile}.json`, "utf8")
            );
          } catch {}

          if (history?.includes(id)) {
            console.log(`Skipping match ${id} - already processed`);
            continue;
          }

          idFiles[idsFile] = idFiles[idsFile]
            ? [...idFiles[idsFile], id]
            : [id];
          ids.push(id);

          const odds = await match
            .locator(".m-market.market .m-outcome .m-outcome-odds")
            .all();

          if (
            await match
              .locator(".m-market.market > .m-outcome--disabled")
              .count()
          ) {
            console.log(`Skipping match ${id} - disabled`);
            continue;
          }

          const selectedOddElement = await selectedOdd(odds);
          await safeClick(selectedOddElement);

          console.log(`✓ Selected odd for match ${id}`);
          j++;

          if (j === 7) {
            await bet();

            // Save history files
            for (const [id, arr] of Object.entries(idFiles)) {
              await writeFile(`./history/${id}.json`, JSON.stringify(arr));
            }

            console.log("✓ Saved history files");
            j = 0;
          }

          await page.waitForTimeout(800);
        } catch (err) {
          console.error(`Error processing match: ${err.message}`);
          continue; // Skip to next match on error
        }
      }
    }

    for (const league of leagues) {
      try {
        console.log(
          `Processing league ${leagues.indexOf(league) + 1}/${leagues.length}`
        );

        const viewAll = league.locator(".view-all");

        if ((await viewAll.count()) > 0) {
          await safeClick(viewAll);
          await stake(page.locator("#importMatch .match-league-wrap"));

          const footballLink = page.getByText("Football").nth(5);
          await safeClick(footballLink);
        } else {
          await stake(league);
        }

        await page.waitForTimeout(500);

        if (leagues.indexOf(league) + 1 === leagues.length) {
          const nextBtn = page.locator(".pageNum.icon-next");
          await safeClick(nextBtn);

          console.log("Moving to next page...");
          await page.waitForTimeout(2000);

          start(); // Recursive call for next page
          return;
        }
      } catch (err) {
        console.error(`Error processing league: ${err.message}`);
        continue; // Skip to next league on error
      }
    }

    await context.close();
  } catch (err) {
    console.error(`Fatal error in start(): ${err.message}`);
    console.error(err.stack);

    // Save progress before exiting
    for (const [id, arr] of Object.entries(idFiles)) {
      await writeFile(`./history/${id}.json`, JSON.stringify(arr));
    }

    throw err;
  }
}

await start();
