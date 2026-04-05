import { chromium } from "playwright";
// import { writeFile, readFile } from "fs/promises";

const context = await chromium.launchPersistentContext("./chromium", {
  viewport: { width: 1050, height: 1000 },
  headless: false,
  slowMo: 1_00,
  args: ["--window-position=1200,0"],
});
const page = context.pages()[0] || (await context.newPage());

await page.bringToFront();

page.setDefaultTimeout(200_000);

await page.goto("https://sportybet.com/gh/sport/football/upcoming?time=24");
await page.waitForTimeout(2_000);

async function start() {
  await page.waitForSelector("#importMatch .match-league-wrap", {
    state: "visible",
  });
  await page.waitForTimeout(200);

  if (!(await page.locator("#j_page_header.s-header.s-header-on").count())) {
    console.log("This is inside the Login Function");
    await page.locator(".m-login-bar .m-opt button[name='register']").click();

    await page
      .locator("div")
      .filter({ hasText: /^Login$/ })
      .first()
      .click();
    await page
      .locator("#esDialog0")
      .getByRole("textbox", { name: "Mobile Number" })
      .fill("593861032");

    await page
      .locator("#esDialog0")
      .getByRole("textbox", { name: "Password" })
      .fill('+n"!p,r6WwA3Vik');
    await page
      .locator("#esDialog0")
      .getByRole("button", { name: "Login" })
      .click();
  }

  const leagues = await page.locator("#importMatch .match-league-wrap").all();

  let games = [];
  let j = 0;

  async function bet() {
    const slip = page.locator(".m-betslips .m-stake");

    await slip.locator(".m-plays-wrapper .m-plays .m-money input").fill("0.5");

    const betBtn = slip.locator(
      ".m-btn-wrapper button.af-button.af-button--primary"
    );

    await betBtn.click();
    await page.waitForTimeout(1_00);
    await betBtn.click();

    await page.waitForTimeout(1_000);

    const confirm = slip.locator(
      ".m-comfirm-wrapper .m-btn-wrapper button.af-button.af-button--primary"
    );

    await confirm.click();
    const success = page.locator(
      ".m-dialog-wrapper .m-btn-wrapper.m-ok-wrap button.af-button.af-button--primary"
    );
    await page.waitForTimeout(2_00);

    await success.click();
  }

  async function createSlips() {
    // Generate 100 unique slips with 9 names each from a pool of 12 names

    function nextCombination(combo, n, k) {
      const result = [...combo];

      // Find the rightmost element that can be incremented
      let i = k - 1;
      while (i >= 0 && result[i] === n - k + i) {
        i--;
      }

      // If no element can be incremented, we've exhausted all combinations
      if (i < 0) {
        return null;
      }

      // Increment the found element
      result[i]++;

      // Set all following elements to consecutive values
      for (let j = i + 1; j < k; j++) {
        result[j] = result[j - 1] + 1;
      }

      return result;
    }

    function generateSlips(names, k = 9, count = 100) {
      const n = names.length;
      const slips = [];

      // Start with the first combination: [0, 1, 2, ..., k-1]
      let current = Array.from({ length: k }, (_, i) => i);
      slips.push([...current]);

      // Generate the next combinations
      for (let i = 1; i < count; i++) {
        current = nextCombination(current, n, k);
        if (current === null) {
          console.error(
            `Only ${i} unique combinations possible with n=${n}, k=${k}`
          );
          break;
        }
        slips.push([...current]);
      }

      return slips;
    }
    const indexSlips = generateSlips(games, 9, 100);

    // Convert index slips to name slips
    const slips = indexSlips.map((slip) => slip.map((index) => games[index]));

    for (const slip of slips) {
      for (const match of slip) {
        await match.click();
      }

      await bet();
      // await page.pause();
    }

    console.log(slips);
  }
  async function build9(league) {
    await league.locator(".market-group .market-item:nth-child(2)").click();
    await page.waitForTimeout(2_00);

    const matches = await league
      .locator(".m-table.match-table > .m-table-row.match-row")
      .all();

    for (const match of matches) {
      const odds = await match
        .locator(".m-market.market .m-outcome .m-outcome-odds")
        .all();

      if (
        await match.locator(".m-market.market > .m-outcome--disabled").count()
      )
        continue;

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
          const maxNum = +Math.max(
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

      games.push(await selectedOdd(odds));

      j++;
      if (j === 12) {
        console.log(games);

        await createSlips();
        j = 0;
      }

      await page.waitForTimeout(500);
    }
  }

  for (const league of leagues) {
    await build9(league);
  }

  await browser.close();
}

await start();
